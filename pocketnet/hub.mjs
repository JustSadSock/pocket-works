import { POCKET_MODULES } from './generated-modules.mjs';

// All rooms share one small, hibernatable SQLite-backed coordinator. This matches
// the personal/friends deployment (max 32 rooms / 48 sockets) without paid KV/D1.
// Game code is statically bundled from pinned version snapshots; no eval/remote code.
const WIRE_VERSION = 1;
const MAX_PAYLOAD = 16 * 1024;
const MAX_STATE = 256 * 1024;
const MAX_ROOMS = 32;
const MAX_CONNECTIONS = 48;
const MAX_PLAYERS = 8;
const ROOM_TTL = 30 * 60_000;
const SESSION_TTL = 7 * 86400_000;
const GAME_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const message = (ws, type, payload = {}) => {
  if (ws.readyState === 1) ws.send(JSON.stringify({ wireVersion: WIRE_VERSION, type, ...payload }));
};
const copied = state => structuredClone(state);
const bytes = value => encoder.encode(typeof value === 'string' ? value : JSON.stringify(value)).byteLength;

export class PocketNetHub {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.queue = Promise.resolve();
    this.rates = new Map();
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, id TEXT NOT NULL, name TEXT NOT NULL, expires INTEGER NOT NULL
    )`);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY, game_id TEXT NOT NULL, version TEXT NOT NULL,
      state TEXT NOT NULL, players TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`);
  }

  run(task) {
    const outcome = this.queue.then(task);
    this.queue = outcome.catch(error => console.error(JSON.stringify({ event: 'pocketnet_error', message: String(error) })));
    return outcome;
  }

  sql(query, ...params) { return this.ctx.storage.sql.exec(query, ...params); }
  countRooms() { return this.sql('SELECT COUNT(*) AS n FROM rooms').one().n; }
  module(gameId, version) {
    const bundle = POCKET_MODULES[gameId];
    const entry = bundle?.versions?.[version || bundle.current];
    return entry?.default?.protocolVersion === 1 ? entry.default : null;
  }
  sockets(roomId) {
    return this.ctx.getWebSockets().filter(ws => ws.readyState === 1 &&
      (!roomId || ws.deserializeAttachment()?.roomId === roomId));
  }
  connected(id, roomId) {
    return this.sockets(roomId).find(ws => ws.deserializeAttachment()?.id === id);
  }
  emit(room, events) {
    if (!Array.isArray(events) || events.length > 32) throw new Error('invalid_module_events');
    for (const event of events) {
      if (typeof event?.type !== 'string' || event.type.length > 64) continue;
      const packet = { roomId: room.id, event };
      if (bytes(packet) > MAX_PAYLOAD) throw new Error('event_too_large');
      if (event.to) {
        if (!room.players.some(p => p.id === event.to)) continue;
        const target = this.connected(event.to, room.id);
        if (target) message(target, 'game_event', packet);
      } else this.broadcast(room, 'game_event', packet);
    }
  }
  broadcast(room, type, payload) {
    for (const ws of this.sockets(room.id)) message(ws, type, payload);
  }
  readRoom(id) {
    const row = this.sql('SELECT * FROM rooms WHERE id = ?', id).toArray()[0];
    return row && {
      id: row.id, gameId: row.game_id, version: row.version,
      state: JSON.parse(row.state), players: JSON.parse(row.players),
      createdAt: row.created_at, updatedAt: row.updated_at
    };
  }
  persist(room) {
    const state = JSON.stringify(room.state);
    if (bytes(state) > MAX_STATE) throw new Error('room_state_too_large');
    const players = JSON.stringify(room.players);
    room.updatedAt = Date.now();
    this.sql(`INSERT INTO rooms (id, game_id, version, state, players, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET state=excluded.state, players=excluded.players, updated_at=excluded.updated_at`,
    room.id, room.gameId, room.version, state, players, room.createdAt, room.updatedAt);
    this.ensureAlarm();
  }
  ensureAlarm() {
    // Alarm wakes the object to retire disconnected abandoned rooms.
    if (this.countRooms()) this.ctx.storage.setAlarm(Date.now() + ROOM_TTL).catch(e => console.error('pocketnet_alarm', String(e)));
  }
  attachment(ws, value) { ws.serializeAttachment(value); }
  setRoom(ws, roomId) {
    const previous = ws.deserializeAttachment() || {};
    this.attachment(ws, { ...previous, roomId });
  }
  async closeRoom(room) {
    this.sql('DELETE FROM rooms WHERE id = ?', room.id);
    this.broadcast(room, 'room_closed', { roomId: room.id });
    for (const ws of this.sockets(room.id)) this.setRoom(ws, null);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const endpoint = url.pathname.replace(/^\/pocketnet/, '');
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ error: 'origin_denied' }, 403);
    if (endpoint === '/health' && request.method === 'GET') {
      return json({ ok: true, transport: 'cloudflare-durable-objects', modules: Object.keys(POCKET_MODULES), rooms: this.countRooms(),
        games: Object.fromEntries(Object.entries(POCKET_MODULES).map(([id, entry]) =>
          [id, { version: entry.current, minPlayers: entry.versions[entry.current].MIN_PLAYERS ?? null,
            rulesVersion: entry.versions[entry.current].RULESET_VERSION ?? null }])) });
    }
    if (endpoint === '/session' && request.method === 'POST') {
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      const prior = this.rates.get(ip);
      const now = Date.now();
      const rate = !prior || now - prior.start > 60_000 ? { start: now, count: 0 } : prior;
      this.rates.set(ip, rate);
      if (++rate.count > 20) return json({ error: 'rate_limited' }, 429);
      if (Number(request.headers.get('content-length') || 0) > 1024) return json({ error: 'request_too_large' }, 413);
      let body;
      try { const raw = await request.text(); if (bytes(raw) > 1024) throw Error(); body = JSON.parse(raw); }
      catch { return json({ error: 'invalid_request' }, 400); }
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 32) return json({ error: 'invalid_name' }, 400);
      // Unpredictable bearer capability, not a user-supplied identity.
      const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
      this.sql('INSERT INTO sessions (token, id, name, expires) VALUES (?, ?, ?, ?)',
        token, crypto.randomUUID(), name, now + SESSION_TTL);
      return json({ token });
    }
    if (endpoint === '/ws' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      if (this.ctx.getWebSockets().length >= MAX_CONNECTIONS) return json({ error: 'server_at_capacity' }, 503);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      this.attachment(server, { id: null, name: null, roomId: null });
      setTimeout(() => {
        if (server.readyState === 1 && !server.deserializeAttachment()?.id) server.close(1008, 'authentication_required');
      }, 5000);
      return new Response(null, { status: 101, webSocket: client });
    }
    return json({ error: 'not_found' }, 404);
  }

  async webSocketMessage(ws, raw) {
    return this.run(async () => {
      try {
        if (typeof raw !== 'string' || bytes(raw) > MAX_PAYLOAD) throw new Error('message_too_large');
        let msg;
        try { msg = JSON.parse(raw); } catch { throw new Error('invalid_message'); }
        if (!msg || typeof msg !== 'object' || msg.wireVersion !== WIRE_VERSION || typeof msg.type !== 'string') throw new Error('invalid_message');
        let player = ws.deserializeAttachment() || {};
        if (msg.type === 'auth') {
          if (player.id) throw new Error('already_authenticated');
          if (typeof msg.token !== 'string' || msg.token.length !== 64) throw new Error('invalid_token');
          const found = this.sql('SELECT id, name FROM sessions WHERE token = ? AND expires > ?', msg.token, Date.now()).toArray()[0];
          if (!found) throw new Error('invalid_token');
          for (const old of this.ctx.getWebSockets()) {
            if (old !== ws && old.deserializeAttachment()?.id === found.id) old.close(4000, 'reconnected');
          }
          player = { id: found.id, name: found.name, roomId: null };
          this.attachment(ws, player);
          message(ws, 'authenticated', { player: { id: player.id, name: player.name } });
          return;
        }
        if (!player.id) throw new Error('authentication_required');
        const member = { id: player.id, name: player.name };
        if (msg.type === 'create_room') {
          if (player.roomId && this.readRoom(player.roomId)) throw new Error('already_in_room');
          if (!GAME_ID.test(msg.gameId) || !POCKET_MODULES[msg.gameId]) throw new Error('game_unavailable');
          if (this.countRooms() >= MAX_ROOMS) throw new Error('server_at_capacity');
          const version = POCKET_MODULES[msg.gameId].current;
          const mod = this.module(msg.gameId, version);
          if (!mod) throw new Error('game_unavailable');
          const players = [member];
          const result = await mod.createRoom({ player: member, players, payload: msg.payload ?? null });
          if (!result || !('state' in result)) throw new Error('invalid_module_state');
          const room = { id: crypto.randomUUID(), gameId: msg.gameId, version, players,
            state: result.state, createdAt: Date.now() };
          this.persist(room);
          this.setRoom(ws, room.id);
          message(ws, 'room_joined', { roomId: room.id, gameId: room.gameId, version: room.version,
            state: room.state, players: room.players });
          if (result.events) this.emit(room, result.events);
          return;
        }
        if (msg.type === 'join_room') {
          if (player.roomId && this.readRoom(player.roomId)) throw new Error('already_in_room');
          if (typeof msg.roomId !== 'string' || !uuid.test(msg.roomId)) throw new Error('room_not_found');
          const room = this.readRoom(msg.roomId);
          if (!room) throw new Error('room_not_found');
          const mod = this.module(room.gameId, room.version);
          if (!mod) throw new Error('room_version_unavailable');
          const previous = room.players.some(p => p.id === player.id);
          if (!previous) {
            if (room.players.length >= MAX_PLAYERS) throw new Error('room_full');
            room.players.push(member);
            const result = mod.onJoin
              ? await mod.onJoin({ state: copied(room.state), player: member, players: room.players, payload: null })
              : { state: room.state, events: [] };
            if (!result || !('state' in result)) throw new Error('invalid_module_state');
            room.state = result.state;
            this.persist(room);
            this.setRoom(ws, room.id);
            message(ws, 'room_joined', { roomId: room.id, gameId: room.gameId, version: room.version,
              state: room.state, players: room.players });
            this.emit(room, result.events ?? []);
          } else {
            this.setRoom(ws, room.id);
            message(ws, 'room_joined', { roomId: room.id, gameId: room.gameId, version: room.version,
              state: room.state, players: room.players });
          }
          this.broadcast(room, 'presence', { roomId: room.id, players: room.players });
          return;
        }
        const room = player.roomId ? this.readRoom(player.roomId) : null;
        if (!room || !room.players.some(p => p.id === player.id)) throw new Error('not_in_room');
        const mod = this.module(room.gameId, room.version);
        if (!mod) throw new Error('room_version_unavailable');
        if (msg.type === 'game_message') {
          const result = await mod.onMessage({ state: copied(room.state), player: member,
            players: room.players, payload: msg.payload });
          if (!result || !('state' in result)) throw new Error('invalid_module_state');
          if (!Array.isArray(result.events ?? []) || result.events.length > 32) throw new Error('invalid_module_events');
          // Validate event payloads before modifying persistent game state.
          for (const event of result.events ?? []) if (bytes({ roomId: room.id, event }) > MAX_PAYLOAD) throw new Error('event_too_large');
          room.state = result.state;
          this.persist(room);
          this.emit(room, result.events ?? []);
          if (result.finished) await this.closeRoom(room);
          return;
        }
        if (msg.type === 'leave_room') {
          room.players = room.players.filter(p => p.id !== player.id);
          const result = mod.onLeave
            ? await mod.onLeave({ state: copied(room.state), player: member, players: room.players })
            : { state: room.state, events: [] };
          if (!result || !('state' in result)) throw new Error('invalid_module_state');
          room.state = result.state;
          this.setRoom(ws, null);
          if (!room.players.length) await this.closeRoom(room);
          else {
            this.persist(room);
            this.emit(room, result.events ?? []);
            this.broadcast(room, 'presence', { roomId: room.id, players: room.players });
          }
          return;
        }
        throw new Error('unknown_message');
      } catch (error) {
        message(ws, 'error', { code: String(error?.message || error).slice(0,80) });
      }
    });
  }

  async webSocketClose(ws) {
    const info = ws.deserializeAttachment();
    if (info?.roomId) {
      const room = this.readRoom(info.roomId);
      if (room) {
        this.broadcast(room, 'presence', { roomId: room.id, players: room.players, disconnected: info.id });
        this.ensureAlarm();
      }
    }
  }

  async alarm() {
    const now = Date.now();
    this.sql('DELETE FROM sessions WHERE expires < ?', now);
    const rows = this.sql('SELECT id, updated_at FROM rooms').toArray();
    for (const row of rows) {
      if (now - row.updated_at < ROOM_TTL || this.sockets(row.id).length) continue;
      const room = this.readRoom(row.id);
      if (room) await this.closeRoom(room);
    }
    if (this.countRooms()) await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL);
  }
}
