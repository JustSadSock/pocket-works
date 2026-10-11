import assert from 'node:assert/strict';
import WebSocket from '../../pocket-server/node_modules/ws/index.js';

const base = process.env.POCKETNET_TEST_URL || 'http://127.0.0.1:8787';
const origin = base;
async function token(name) {
  const response = await fetch(base + '/pocketnet/session', {
    method: 'POST', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ name })
  });
  assert.equal(response.status, 200, 'Session failed');
  return (await response.json()).token;
}
async function client(token) {
  const ws = new WebSocket(base.replace(/^http/, 'ws') + '/pocketnet/ws', { origin });
  const inbox = [], waiters = [];
  ws.on('message', raw => {
    const msg = JSON.parse(String(raw));
    const waiter = waiters.find(item => item.type === msg.type && item.match(msg));
    if (waiter) {
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.ok(msg);
    } else inbox.push(msg);
  });
  await new Promise((resolve, reject) => {
    ws.once('open',resolve);
    ws.once('error',reject);
  });
  const next = (type, match = () => true) => {
    const index = inbox.findIndex(item => item.type === type && match(item));
    if (index !== -1) return Promise.resolve(inbox.splice(index,1)[0]);
    return new Promise((ok, fail) => {
      const w = { type, match, ok }; waiters.push(w);
      setTimeout(() => {
        if (!waiters.includes(w)) return;
        waiters.splice(waiters.indexOf(w),1);
        fail(new Error('Timeout ' + type + ': ' + JSON.stringify(inbox)));
      },8000).unref();
    });
  };
  const send = (type, details = {}) => ws.send(JSON.stringify({ wireVersion:1, type, ...details }));
  send('auth', { token });
  assert.equal((await next('authenticated')).type,'authenticated');
  return { ws, send, next };
}
async function close(client) {
  if (!client || client.ws.readyState === WebSocket.CLOSED) return;
  await new Promise(resolve => {
    client.ws.once('close',resolve);
    client.ws.close();
    setTimeout(() => client.ws.terminate(),1500).unref();
  });
}
const status = await (await fetch(base + '/pocketnet/health')).json();
assert.equal(status.ok, true);
assert.ok(status.modules.includes('flagpost'),'Flagpost not registered in Cloudflare PocketNet');
assert.equal(status.games.flagpost.minPlayers,2);

const [a,b,c] = await Promise.all([token('North'),token('South'),token('Intruder')]);
const host = await client(a), guest = await client(b), third = await client(c);
let recovered = null;
try {
  host.send('create_room',{gameId:'flagpost'});
  const created = await host.next('room_joined');
  const code = created.roomId.slice(0, 8).toUpperCase();
  assert.match(code,/^[A-F0-9]{8}$/);
  assert.equal(created.state.phase,'lobby');
  assert.equal(created.version,'v1');
  const id = created.roomId;
  guest.send('join_room',{roomId:code.toLowerCase()});
  const joined = await guest.next('room_joined');
  assert.equal(joined.roomId,id);
  assert.equal(joined.roomId,id);
  assert.equal(joined.players.length,2);
  third.send('join_room',{roomId:code});
  assert.equal((await third.next('error')).code,'room_full','Third player should be denied');
  guest.send('game_message',{payload:{type:'start'}});
  assert.match((await guest.next('game_event',m=>m.event.type==='notice')).event.payload,/создатель/i);
  host.send('game_message',{payload:{type:'start'}});
  let st=(await host.next('game_event',m=>m.event.type==='state'&&m.event.payload.phase==='battle')).event.payload;
  assert.equal(st.players.length,2);
  assert.equal(st.actions,2);
  assert.equal(st.units.length,6);
  guest.send('game_message',{payload:{type:'move',x:2,y:5,tx:2,ty:4}});
  assert.match((await guest.next('game_event',m=>m.event.type==='notice')).event.payload,/ход соперника/i);
  host.send('game_message',{payload:{type:'move',x:2,y:1,tx:2,ty:2}});
  st=(await host.next('game_event',m=>m.event.type==='state'&&m.event.payload.actions===1)).event.payload;
  assert.ok(st.units.some(u=>u.side===0&&u.x===2&&u.y===2));
  host.send('game_message',{payload:{type:'move',x:2,y:2,tx:2,ty:3}});
  st=(await host.next('game_event',m=>m.event.type==='state'&&m.event.payload.actions===0)).event.payload;
  assert.equal(st.scores[0],0,'Flags should only score on ending a turn');
  host.send('game_message',{payload:{type:'end'}});
  st=(await host.next('game_event',m=>m.event.type==='state'&&m.event.payload.turn===1)).event.payload;
  assert.equal(st.scores[0],1,'Center occupant must score after turn');
  assert.equal(st.actions,2);
  // Reconnect must retain identity and the current authoritative board state.
  await close(guest);
  recovered=await client(b);
  recovered.send('join_room',{roomId:code});
  const rejoined=await recovered.next('room_joined');
  assert.equal(rejoined.state.scores[0],1);
  assert.equal(rejoined.state.turn,1);
  recovered.send('game_message',{payload:{type:'resign'}});
  st=(await host.next('game_event',m=>m.event.type==='state'&&m.event.payload.phase==='finished')).event.payload;
  assert.equal(st.winner,0);
  host.send('game_message',{payload:{type:'again'}});
  st=(await host.next('game_event',m=>m.event.type==='state'&&m.event.payload.phase==='lobby')).event.payload;
  assert.equal(st.scores[0],0);
  assert.equal(st.players.length,2);
  host.send('game_message',{payload:{type:'start'}});
  st=(await host.next('game_event',m=>m.event.type==='state'&&m.event.payload.phase==='battle')).event.payload;
  assert.equal(st.units.length,6);
  recovered.send('leave_room');
  st=(await host.next('game_event',m=>m.event.type==='state'&&m.event.payload.phase==='finished')).event.payload;
  assert.equal(st.winner,0);
  assert.equal(st.players[0].id,created.players[0].id);
  host.send('leave_room');
  let remaining = 1;
  for (let attempt=0;attempt<40;attempt++) {
    remaining=(await (await fetch(base + '/pocketnet/health')).json()).rooms;
    if (!remaining) break;
    await new Promise(resolve => setTimeout(resolve,50));
  }
  assert.equal(remaining,0,'Last player leaving must remove the persisted room');
  third.send('join_room',{roomId:code});
  assert.equal((await third.next('error')).code,'room_not_found');
  console.log('PASS Flagpost: short code, 2 players, seat cap, server-only turns, movement, center score, reconnect, surrender, rematch, cleanup');
} finally {
  await Promise.all([close(host),close(guest),close(recovered),close(third)]);
}
