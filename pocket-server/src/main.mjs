import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { ModuleRegistry } from './modules.mjs';
import { GAME_ID, MAX_MESSAGE_BYTES, parseMessage, send, tokenFor, verifyToken } from './protocol.mjs';

const production = process.env.NODE_ENV === 'production';
const authSecret = process.env.POCKET_AUTH_SECRET || (production ? '' : randomBytes(32).toString('hex'));
const deployToken = process.env.POCKET_DEPLOY_TOKEN || '';
if (!authSecret || (production && !deployToken)) throw new Error('Set POCKET_AUTH_SECRET and POCKET_DEPLOY_TOKEN in production');
const port = Number(process.env.PORT || 8788);
const dataDir = path.resolve(process.env.POCKET_DATA_DIR || './pocket-server-data');
const modules = new ModuleRegistry(path.join(dataDir, 'modules'));
const roomDir = path.join(dataDir, 'rooms');
const rooms = new Map();
const sockets = new Map();
const sessionRates = new Map();
const log = (event, fields = {}) => console.log(JSON.stringify({ time: new Date().toISOString(), event, ...fields }));

function response(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readJson(req, maximum) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > maximum) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function authorized(req) {
  const given = req.headers.authorization?.replace(/^Bearer /, '') || '';
  const left = Buffer.from(given);
  const right = Buffer.from(deployToken);
  return Boolean(deployToken) && left.length === right.length && timingSafeEqual(left, right);
}
async function saveRoom(room) {
  const filename = path.join(roomDir, `${room.id}.json`);
  const temp = `${filename}.${process.pid}.tmp`;
  room.updatedAt = Date.now();
  const { id, gameId, version, state, players, createdAt, updatedAt } = room;
  await writeFile(temp, JSON.stringify({ id, gameId, version, state, players, createdAt, updatedAt }));
  await rename(temp, filename);
}
function enqueue(room, task) {
  const result = room.queue.then(task);
  room.queue = result.catch(error => log('room_operation_failed', { roomId: room.id, error: String(error) }));
  return result;
}
function roomBroadcast(room, type, payload) {
  for (const player of room.players) {
    const socket = sockets.get(player.id);
    if (socket?.roomId === room.id) send(socket.ws, type, payload);
  }
}
async function closeRoom(room) {
  rooms.delete(room.id);
  roomBroadcast(room, 'room_closed', { roomId: room.id });
  for (const member of room.players) {
    const connection = sockets.get(member.id);
    if (connection?.roomId === room.id) connection.roomId = null;
  }
  await rm(path.join(roomDir, `${room.id}.json`), { force: true });
  await modules.release(room.handle, room.id);
  log('room_closed', { roomId: room.id, gameId: room.gameId });
}
async function transition(room, action, player, payload = null) {
  const result = await modules.call(room.handle, action, { state: room.state, player: { id: player.id, name: player.name }, payload, players: room.players });
  const encoded = JSON.stringify(result.state);
  if (Buffer.byteLength(encoded) > 256 * 1024) throw new Error('room_state_too_large');
  room.state = result.state;
  await saveRoom(room);
  if (!Array.isArray(result.events) || result.events.length > 32) throw new Error('invalid_module_events');
  for (const event of result.events) {
    if (typeof event?.type !== 'string' || event.type.length > 64) continue;
    if (event.to) {
      const target = sockets.get(event.to);
      if (room.players.some(p => p.id === event.to) && target?.roomId === room.id) send(target.ws, 'game_event', { roomId: room.id, event });
    } else roomBroadcast(room, 'game_event', { roomId: room.id, event });
  }
  if (result.finished) await closeRoom(room);
}
await mkdir(roomDir, { recursive: true });
const snapshots = [];
for (const filename of await readdir(roomDir)) {
  if (!/^[0-9a-f-]{36}\.json$/.test(filename)) continue;
  try {
    snapshots.push(JSON.parse(await readFile(path.join(roomDir, filename), 'utf8')));
  } catch (error) { log('room_restore_failed', { filename, error: String(error) }); }
}
await modules.load(new Set(snapshots.map(snapshot => `${snapshot.gameId}@${snapshot.version}`)));
for (const snapshot of snapshots) {
  try {
    const handle = modules.versions.get(`${snapshot.gameId}@${snapshot.version}`);
    if (!handle || !Array.isArray(snapshot.players)) throw new Error('Missing module or invalid snapshot');
    const room = { ...snapshot, handle, queue: Promise.resolve() };
    rooms.set(room.id, room);
    handle.rooms.add(room.id);
  } catch (error) { log('room_restore_failed', { roomId: snapshot.id, error: String(error) }); }
}
await modules.prune();

const server = createServer(async (req, res) => {
  try {
    const origin = req.headers.origin;
    const allowedOrigins = process.env.POCKET_ALLOWED_ORIGINS?.split(',').map(x => x.trim()).filter(Boolean) || [];
    if (origin) {
      if (production && !allowedOrigins.includes(origin)) return response(res, 403, { error: 'origin_denied' });
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'Origin');
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      res.setHeader('access-control-allow-headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') return response(res, 204, {});
    if (req.method === 'GET' && req.url === '/health') return response(res, 200, { ok: true, modules: [...modules.active.keys()], rooms: rooms.size });
    if (req.method === 'POST' && req.url === '/session') {
      const address = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
        ? String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim()
        : req.socket.remoteAddress || 'unknown';
      const previous = sessionRates.get(address);
      const window = !previous || Date.now() - previous.start > 60_000 ? { start: Date.now(), count: 0 } : previous;
      if (++window.count > 20) return response(res, 429, { error: 'rate_limited' });
      sessionRates.set(address, window);
      const body = await readJson(req, 1024);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 32) return response(res, 400, { error: 'invalid_name' });
      return response(res, 200, { token: tokenFor(authSecret, { name }) });
    }
    if (req.method === 'POST' && req.url === '/admin/modules') {
      if (!authorized(req)) return response(res, 401, { error: 'unauthorized' });
      const result = await modules.publish(await readJson(req, 1_500_000));
      log('module_published', { gameId: result.gameId, version: result.version });
      return response(res, 200, { gameId: result.gameId, version: result.version });
    }
    response(res, 404, { error: 'not_found' });
  } catch (error) {
    log('http_error', { error: String(error) });
    response(res, 400, { error: String(error.message || error) });
  }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws') return socket.destroy();
  const allowed = process.env.POCKET_ALLOWED_ORIGINS?.split(',').map(x => x.trim()).filter(Boolean) || [];
  if (production && (!allowed.length || !allowed.includes(req.headers.origin))) return socket.destroy();
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
});
wss.on('connection', ws => {
  let player = null;
  let roomId = null;
  let count = 0;
  let windowStart = Date.now();
  let incoming = Promise.resolve();
  const authTimeout = setTimeout(() => { if (!player) ws.close(1008, 'authentication_required'); }, 5000);
  ws.on('message', raw => { incoming = incoming.then(async () => {
    try {
      if (Date.now() - windowStart > 1000) { windowStart = Date.now(); count = 0; }
      if (++count > 30) throw new Error('rate_limited');
      const message = parseMessage(raw);
      if (message.type === 'auth') {
        if (player) throw new Error('already_authenticated');
        player = verifyToken(authSecret, message.token);
        if (!player) throw new Error('invalid_token');
        clearTimeout(authTimeout);
        const old = sockets.get(player.id);
        if (old) old.ws.close(4000, 'reconnected');
        sockets.set(player.id, { ws, roomId: null });
        return send(ws, 'authenticated', { player: { id: player.id, name: player.name } });
      }
      if (!player) throw new Error('authentication_required');
      if (message.type === 'create_room') {
        if (roomId && rooms.has(roomId)) throw new Error('already_in_room');
        roomId = null;
        if (!GAME_ID.test(message.gameId)) throw new Error('invalid_game');
        const handle = modules.current(message.gameId);
        if (!handle) throw new Error('game_unavailable');
        const id = randomUUID();
        const players = [{ id: player.id, name: player.name }];
        const result = await modules.call(handle, 'create', { player: players[0], players, payload: message.payload || null });
        if (Buffer.byteLength(JSON.stringify(result.state)) > 256 * 1024) throw new Error('room_state_too_large');
        const room = { id, gameId: message.gameId, version: handle.version, state: result.state, players, createdAt: Date.now(), handle, queue: Promise.resolve() };
        await saveRoom(room);
        rooms.set(id, room);
        handle.rooms.add(id);
        roomId = id;
        sockets.get(player.id).roomId = id;
        log('room_created', { roomId: id, gameId: room.gameId, version: room.version });
        return send(ws, 'room_joined', { roomId: id, gameId: room.gameId, version: room.version, state: room.state, players });
      }
      if (message.type === 'join_room') {
        if (roomId && rooms.has(roomId)) throw new Error('already_in_room');
        roomId = null;
        const room = rooms.get(message.roomId);
        if (!room) throw new Error('room_not_found');
        await enqueue(room, async () => {
          if (!room.players.some(p => p.id === player.id)) {
            if (room.players.length >= 8) throw new Error('room_full');
            room.players.push({ id: player.id, name: player.name });
            await transition(room, 'join', player);
          }
          roomId = room.id;
          sockets.get(player.id).roomId = room.id;
          send(ws, 'room_joined', { roomId: room.id, gameId: room.gameId, version: room.version, state: room.state, players: room.players });
          roomBroadcast(room, 'presence', { roomId: room.id, players: room.players });
        });
        return;
      }
      const room = rooms.get(roomId);
      if (!room) throw new Error('not_in_room');
      if (message.type === 'game_message') return await enqueue(room, () => transition(room, 'message', player, message.payload));
      if (message.type === 'leave_room') {
        await enqueue(room, async () => {
          room.players = room.players.filter(p => p.id !== player.id);
          await transition(room, 'leave', player);
          roomId = null;
          sockets.get(player.id).roomId = null;
          if (!room.players.length && rooms.has(room.id)) await closeRoom(room);
          else if (rooms.has(room.id)) roomBroadcast(room, 'presence', { roomId: room.id, players: room.players });
        });
        return;
      }
      throw new Error('unknown_message');
    } catch (error) { send(ws, 'error', { code: String(error.message || error) }); }
  }); });
  ws.on('close', () => {
    clearTimeout(authTimeout);
    if (player && sockets.get(player.id)?.ws === ws) {
      sockets.delete(player.id);
      const room = rooms.get(roomId);
      if (room) roomBroadcast(room, 'presence', { roomId, players: room.players, disconnected: player.id });
    }
  });
});
server.listen(port, () => log('server_listening', { port, restoredRooms: rooms.size }));
setInterval(() => {
  for (const [address, window] of sessionRates) if (Date.now() - window.start > 60_000) sessionRates.delete(address);
}, 60_000).unref();
setInterval(() => {
  for (const room of rooms.values()) {
    const connected = room.players.some(player => sockets.get(player.id)?.roomId === room.id);
    if (!connected && Date.now() - (room.updatedAt || room.createdAt) > 30 * 60_000) {
      enqueue(room, () => rooms.has(room.id) ? closeRoom(room) : undefined);
    }
  }
}, 60_000).unref();
