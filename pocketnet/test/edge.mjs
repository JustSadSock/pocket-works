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
assert.equal(initial.games.zamazka.rulesVersion, 18);
const firstToken = await session('Painter');
const secondToken = await session('Observer');
assert.notEqual(firstToken, secondToken);
const first = await channel(firstToken);
const second = await channel(secondToken);
let again;
try {
  assert.equal((await first.next('authenticated')).player.name, 'Гость · Painter');
  assert.equal((await second.next('authenticated')).player.name, 'Гость · Observer');
  first.send('create_room', { gameId: 'zamazka' });
  const created = await first.next('room_joined');
  assert.equal(created.state.phase, 'lobby');
  assert.match(created.version, /^v[1-9][0-9]*$/, 'room must pin a valid immutable module version');
  const roomId = created.roomId;
  const code = roomId.slice(0, 8).toUpperCase();
  second.send('join_room', { roomId: '00000000' });
  assert.equal((await second.next('error')).code, 'room_not_found');
  second.send('join_room', { roomId: code });
  assert.equal((await second.next('room_joined')).roomId, roomId);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';
  second.send('game_message', { payload: { type: 'emblem', image: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' } });
  assert.match((await second.next('game_event', m => m.event?.type === 'notice')).event.payload, /знак/i);
  second.send('game_message', { payload: { type: 'emblem', image: png } });
  const badge = await first.next('game_event', event => event.event?.type === 'state' && event.event.payload.emblems?.[(event.event.payload.participants || []).find(p => p.name === 'Гость · Observer')?.id] === png);
  assert.equal(Object.values(badge.event.payload.emblems).includes(png), true);
  // Live strokes: send deltas, receive in peer socket without full state rerender.
  const packet={type:'board_delta',revision:0,k:'smoke1',q:0,c:'#3d3028',s:9,p:[[12,15],[55,77]]};
  first.send('game_message',{payload:packet});
  const live=await second.next('game_event',m=>m.event?.type==='board_delta');
  assert.equal(live.event.payload.u,created.players[0].id);
  assert.deepEqual(live.event.payload.p,packet.p);
  second.send('game_message',{payload:{type:'sync'}});
  const fresh=await second.next('game_event',m=>m.event?.type==='state'&&m.event.payload.board?.segments.length===1);
  assert.equal(fresh.event.payload.board.segments[0].k,'smoke1');
  second.send('game_message',{payload:{...packet,c:'not-a-color'}});
  const rejected=await second.next('game_event',m=>m.event?.type==='notice');
  assert.match(rejected.event.payload,/мазок/i);
  second.send('game_message',{payload:{type:'board_clear'}});
  const denied=await second.next('game_event',m=>m.event?.type==='notice');
  assert.match(denied.event.payload,/куратор/i);
  first.send('game_message',{payload:{type:'board_clear'}});
  const cleared=await second.next('game_event',m=>m.event?.type==='board_reset');
  assert.equal(cleared.event.payload.segments.length,0);
  assert.equal(cleared.event.payload.revision,1);
  // Only the curator may forcibly release a guest's network room seat.
  const guestId=fresh.event.payload.participants.find(p=>p.id!==created.players[0].id).id;
  second.send('game_message',{payload:{type:'kick_player',targetId:created.players[0].id}});
  assert.match((await second.next('game_event',m=>m.event?.type==='notice')).event.payload,/куратор/i);
  first.send('game_message',{payload:{type:'kick_player',targetId:created.players[0].id}});
  assert.match((await first.next('game_event',m=>m.event?.type==='notice')).event.payload,/нельзя/i);
  first.send('game_message',{payload:{type:'kick_player',targetId:guestId}});
  const removed=await second.next('room_kicked');
  assert.equal(removed.roomId,roomId);
  first.send('game_message',{payload:{type:'sync'}});
  const afterKick=await first.next('game_event',m=>m.event?.type==='state'&&m.event.payload.participants.length===1);
  assert.equal(afterKick.event.payload.board.segments.length,0);
  second.send('game_message',{payload:{type:'sync'}});
  assert.equal((await second.next('error')).code,'not_in_room');
  // Kick does not permanently ban the player: a new invite still works.
  second.send('join_room',{roomId:code});
  assert.equal((await second.next('room_joined')).roomId,roomId);
  first.send('game_message',{payload:{type:'start',rounds:1}});

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
  console.log('PASS: PocketNet rooms, concurrent incremental drawing, snapshots, clear permissions, security, reconnect');
} finally {
  await close(first);
  await close(second);
  if (again) await close(again);
}
