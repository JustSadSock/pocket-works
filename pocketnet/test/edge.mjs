import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import WebSocket from '../../pocket-server/node_modules/ws/index.js';

const base = process.env.POCKETNET_TEST_URL || 'http://127.0.0.1:8787';
async function health() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(base + '/pocketnet/health');
      if (response.ok) return response.json();
    } catch {}
    await sleep(300);
  }
  throw new Error('PocketNet Worker did not start; inspect Wrangler dev logs');
}
async function session(name) {
  const response = await fetch(base + '/pocketnet/session', { method: 'POST',
    headers: { origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ name }) });
  assert.equal(response.status, 200);
  return (await response.json()).token;
}
function channel(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace(/^http/, 'ws') + '/pocketnet/ws', { origin: base });
    const inbox = [], pending = [];
    const timeout = setTimeout(() => reject(new Error('WebSocket open timeout')), 8000);
    ws.once('error', reject);
    ws.once('open', () => {
      clearTimeout(timeout);
      resolve({
        ws,
        send: (type, args = {}) => ws.send(JSON.stringify({ wireVersion: 1, type, ...args })),
        next: (type, predicate = () => true) => {
          const index = inbox.findIndex(item => item.type === type && predicate(item));
          if (index !== -1) return Promise.resolve(inbox.splice(index, 1)[0]);
          return new Promise((ok, fail) => {
            const waiter = { type, predicate, ok, fail };
            pending.push(waiter);
            setTimeout(() => {
              if (pending.includes(waiter)) {
                pending.splice(pending.indexOf(waiter), 1);
                fail(new Error('Timeout waiting for ' + type + ': ' + JSON.stringify(inbox)));
              }
            }, 8000).unref();
          });
        }
      });
      ws.send(JSON.stringify({ wireVersion: 1, type: 'auth', token }));
    });
    ws.on('message', raw => {
      const item = JSON.parse(String(raw));
      const matching = pending.find(waiter => waiter.type === item.type && waiter.predicate(item));
      if (matching) {
        pending.splice(pending.indexOf(matching), 1);
        matching.ok(item);
      } else inbox.push(item);
    });
  });
}
async function close(channel) {
  if (channel.ws.readyState === WebSocket.CLOSED) return;
  await new Promise(resolve => {
    channel.ws.once('close', resolve);
    channel.ws.close();
    setTimeout(() => channel.ws.terminate(), 1000).unref();
  });
}

const initial = await health();
assert.equal(initial.ok, true);
assert.equal(initial.transport, 'cloudflare-durable-objects');
assert.ok(initial.modules.includes('zamazka'));
assert.equal(initial.games.zamazka.minPlayers, 2);
assert.equal(initial.games.zamazka.rulesVersion, 2);
const firstToken = await session('Painter');
const secondToken = await session('Observer');
assert.notEqual(firstToken, secondToken);
const first = await channel(firstToken);
const second = await channel(secondToken);
let again;
try {
  assert.equal((await first.next('authenticated')).player.name, 'Painter');
  assert.equal((await second.next('authenticated')).player.name, 'Observer');
  first.send('create_room', { gameId: 'zamazka' });
  const created = await first.next('room_joined');
  assert.equal(created.state.phase, 'lobby');
  assert.equal(created.version, 'v1');
  const roomId = created.roomId;
  const code = roomId.slice(0, 8).toUpperCase();
  second.send('join_room', { roomId: '00000000' });
  assert.equal((await second.next('error')).code, 'room_not_found');
  second.send('join_room', { roomId: code });
  assert.equal((await second.next('room_joined')).roomId, roomId);
  first.send('game_message', { payload: { type: 'start', rounds: 1 } });
  const started = await first.next('game_event', event => event.event?.type === 'state' && event.event.payload.phase === 'preview');
  assert.equal(started.event.payload.round, 1);
  await close(second);
  again = await channel(secondToken);
  await again.next('authenticated');
  again.send('join_room', { roomId });
  const restored = await again.next('room_joined');
  assert.equal(restored.state.phase, 'preview');
  assert.equal(restored.players.length, 2);
  again.send('game_message', { payload: { type: 'sync' } });
  assert.equal((await again.next('game_event', event => event.event?.type === 'state')).event.payload.phase, 'preview');
  first.send('leave_room');
  await sleep(100);
  again.send('leave_room');
  assert.equal((await health()).rooms, 0);
  console.log('PASS: Cloudflare DO session, short room code, invalid code, UUID reconnect and cleanup');
} finally {
  await close(first);
  await close(second);
  if (again) await close(again);
}
