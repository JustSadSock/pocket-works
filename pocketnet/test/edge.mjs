import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import {readFile} from 'node:fs/promises';
const versionLock=JSON.parse(await readFile(new URL('../modules.lock.json',import.meta.url),'utf8'));

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
assert.equal(initial.games.zamazka.rulesVersion, 21);
const firstToken = await session('Painter');
const secondToken = await session('Observer');
assert.notEqual(firstToken, secondToken);
const first = await channel(firstToken);
const second = await channel(secondToken);
let again,resumedHost,resumedGuest,replacement,replacementToken;
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
  // The kicked account may not use the same invite again; a genuinely new
  // participant may occupy the freed lobby seat before the match starts.
  second.send('join_room',{roomId:code});
  assert.equal((await second.next('error')).code,'room_kicked');
  replacementToken=await session('Replacement');
  replacement=await channel(replacementToken);
  await replacement.next('authenticated');
  replacement.send('join_room',{roomId:code});
  assert.equal((await replacement.next('room_joined')).roomId,roomId);
  first.send('game_message',{payload:{type:'start',rounds:1}});

  const started = await first.next('game_event', event => event.event?.type === 'state' && event.event.payload.phase === 'preview');
  assert.equal(started.event.payload.round, 1);
  await close(second);
  await close(replacement);
  again = await channel(replacementToken);
  await again.next('authenticated');
  again.send('join_room', { roomId });
  const restored = await again.next('room_joined');
  assert.equal(restored.state.phase, 'preview');
  assert.equal(restored.players.length, 2);
  again.send('game_message', { payload: { type: 'sync' } });
  assert.equal((await again.next('game_event', event => event.event?.type === 'state')).event.payload.phase, 'preview');
  // A complete disconnection suspends the room, including its drawing deadline.
  await close(first);
  await close(again);
  await sleep(450);
  resumedHost=await channel(firstToken);
  await resumedHost.next('authenticated');
  resumedHost.send('join_room',{roomId});
  const frozen=await resumedHost.next('room_joined');
  // The room_joined packet intentionally omits private Zamazka session
  // details; only a role-specific sync may disclose pause and deadline.
  assert.deepEqual(frozen.state,{phase:'preview'});
  resumedHost.send('game_message',{payload:{type:'sync'}});
  const pausedSnapshot=await resumedHost.next('game_event',event=>event.event?.type==='state');
  assert.equal(pausedSnapshot.event.payload.paused,true,
   'first reconnected player finds paused room; view='+JSON.stringify({
    paused:pausedSnapshot.event.payload.paused,
    onlineIds:pausedSnapshot.event.payload.onlineIds,
    phase:pausedSnapshot.event.payload.phase
   }));
  assert(pausedSnapshot.event.payload.pauseRemainingMs>=0,'server preserves remaining seconds');
  resumedGuest=await channel(replacementToken);
  await resumedGuest.next('authenticated');
  resumedGuest.send('join_room',{roomId});
  await resumedGuest.next('room_joined');
  const unfrozen=await resumedHost.next('game_event',event=>
   event.event?.type==='state'&&event.event.payload.paused===false);
  assert.equal(unfrozen.event.payload.phase,'preview','room restores same stage');
  assert(unfrozen.event.payload.deadline>Date.now(),'resumed deadline is future');
  resumedHost.send('leave_room');
  await sleep(100);
  resumedGuest.send('leave_room');
  assert.equal((await health()).rooms, 0);
  console.log('PASS: PocketNet rooms, concurrent incremental drawing, snapshots, clear permissions, security, reconnect, complete outage and resumed timed match');
} finally {
  await close(first);
  await close(second);
  if (replacement) await close(replacement);
  if (again) await close(again);
  if (resumedHost) await close(resumedHost);
  if (resumedGuest) await close(resumedGuest);
}


/* BNT v0.4: exercise the actual Durable Object projection (not a browser mock).
   A missing projection at ANY of create, join, broadcast, sync or reconnect leaks
   the server-side seed and all other players' exclusive clues. */
const xToken=await session('Needkeeper');
const yToken=await session('Bellkeeper');
let x=null,y=null,z=null;
try{
 x=await channel(xToken);y=await channel(yToken);
 await x.next('authenticated');await y.next('authenticated');
 x.send('create_room',{gameId:'bozhe-ne-tak'});
 const created=await x.next('room_joined');
 assert.equal(created.version,versionLock['bozhe-ne-tak'].current);
 assert.equal(created.state.phase,'lobby');
 assert.equal(created.state.match,null);
 y.send('join_room',{roomId:created.roomId.slice(0,8)});
 const joined=await y.next('room_joined');
 assert.equal(joined.roomId,created.roomId);
 x.send('game_message',{payload:{type:'start'}});
 const startedX=await x.next('game_event',m=>m.event?.type==='state'&&m.event.payload.phase==='play');
 const startedY=await y.next('game_event',m=>m.event?.type==='state'&&m.event.payload.phase==='play');
 const vx=startedX.event.payload,vy=startedY.event.payload;
 assert.deepEqual(vx.ownTasks,['need','taboo','offering']);
 assert.deepEqual(vy.ownTasks,['bell','height']);
 for(const v of [vx,vy]){
  assert.ok(!('seed' in v.match)&&!('order' in v.match));
  assert.ok(!('riddle' in v.match));
  assert.ok(!('lastSeq' in v));
  assert.ok(!JSON.stringify(v).includes('"seed"'));
  assert.ok(!JSON.stringify(v).includes('"order"'));
 }
 assert.ok(vx.ownClues.need&&vx.ownClues.taboo&&vx.ownClues.treatment);
 assert.ok(!vy.ownClues.need&&!vy.ownClues.taboo&&!vy.ownClues.treatment);
 assert.ok(vy.ownClues.bell&&vy.ownClues.height);
 assert.ok(!vx.ownClues.bell&&!vx.ownClues.height);
 x.send('game_message',{payload:{type:'reveal',task:'need',seq:1,phaseId:vx.phaseId}});
 const publicMessage=await y.next('game_event',m=>m.event?.type==='state'&&m.event.payload.done?.need===true);
 assert.ok(publicMessage.event.payload.announcements.some(a=>a.kind==='revelation'));
 assert.ok(!publicMessage.event.payload.ownClues.taboo);
 y.send('game_message',{payload:{type:'sync'}});
 const personal=await y.next('game_event',m=>m.event?.type==='state'&&m.event.to===vy.players.find(p=>p.name==='Гость · Bellkeeper')?.id);
 assert.ok(personal.event.payload.ownClues.bell);
 assert.ok(!personal.event.payload.ownClues.need);
 await close(x);x=null;
 z=await channel(xToken);await z.next('authenticated');
 z.send('join_room',{roomId:created.roomId});
 const restored=await z.next('room_joined');
 assert.deepEqual(restored.state.ownTasks,['need','taboo','offering']);
 assert.equal(restored.state.done.need,true);
 assert.ok(!restored.state.ownClues.bell);
 z.send('leave_room');y.send('leave_room');
 console.log('PASS: PocketNet private room views on create, join, broadcast, sync and reconnect');
} finally {
 if(x)await close(x);if(y)await close(y);if(z)await close(z);
}


/* Blockies (current pinned ruleset): the same real Worker must elect the next host from live sockets,
   preserve the serialized playfield and let the old host reclaim its own seat. */
const blockiesHostToken=await session('Blockies host');
const blockiesPartnerToken=await session('Blockies partner');
let blockiesHost,blockiesPartner,blockiesRestoredHost;
try{
  blockiesHost=await channel(blockiesHostToken);
  blockiesPartner=await channel(blockiesPartnerToken);
  const hostID=(await blockiesHost.next('authenticated')).player.id;
  const partnerID=(await blockiesPartner.next('authenticated')).player.id;
  blockiesHost.send('create_room',{gameId:'blockies'});
  const initialBlockies=await blockiesHost.next('room_joined');
  assert.equal(initialBlockies.version,versionLock.blockies.current);
  const stableId=initialBlockies.roomId;
  blockiesPartner.send('join_room',{roomId:stableId});
  await blockiesPartner.next('room_joined');
  blockiesHost.send('game_message',{payload:{type:'ready'}});
  await blockiesPartner.next('game_event',m=>m.event?.type==='state'&&m.event.payload.players?.some(p=>p.id===hostID&&p.ready));
  blockiesPartner.send('game_message',{payload:{type:'ready'}});
  await blockiesPartner.next('game_event',m=>m.event?.type==='state'&&m.event.payload.started===true);
  blockiesHost.send('game_message',{payload:{type:'input',input:{action:'hardDrop'}}});
  const beforeDisconnect=await blockiesPartner.next('game_event',m=>
    m.event?.type==='state'&&m.event.payload.engine?.board?.flat().some(Boolean));
  const savedBoard=beforeDisconnect.event.payload.engine.board;
  const savedRound=beforeDisconnect.event.payload.round;
  const savedScore=beforeDisconnect.event.payload.engine.sharedStats.score;
  await close(blockiesHost);
  blockiesPartner.send('game_message',{payload:{type:'pulse'}});
  const inherited=await blockiesPartner.next('game_event',m=>
    m.event?.type==='state'&&m.event.payload.hostId===partnerID);
  assert.equal(inherited.event.payload.round,savedRound);
  assert.deepEqual(inherited.event.payload.engine.board,savedBoard);
  assert.equal(inherited.event.payload.engine.sharedStats.score,savedScore);
  blockiesPartner.send('game_message',{payload:{type:'pause'}});
  const pausedBlockies=await blockiesPartner.next('game_event',m=>
    m.event?.type==='state'&&m.event.payload.paused===true);
  assert.equal(pausedBlockies.event.payload.hostId,partnerID);
  blockiesPartner.send('game_message',{payload:{type:'pause'}});
  await blockiesPartner.next('game_event',m=>
    m.event?.type==='state'&&m.event.payload.paused===false);
  blockiesRestoredHost=await channel(blockiesHostToken);
  assert.equal((await blockiesRestoredHost.next('authenticated')).player.id,hostID);
  blockiesRestoredHost.send('join_room',{roomId:stableId});
  const restoredBlockies=await blockiesRestoredHost.next('room_joined');
  assert.equal(restoredBlockies.state.round,savedRound);
  assert.equal(restoredBlockies.state.hostId,partnerID);
  assert.deepEqual(restoredBlockies.state.engine.board,savedBoard);
  assert.equal(restoredBlockies.state.players.find(p=>p.id===hostID)?.left,false);
  blockiesRestoredHost.send('leave_room');
  await blockiesPartner.next('presence',m=>m.roomId===stableId&&m.players.every(p=>p.id!==hostID));
  blockiesPartner.send('leave_room');
  await sleep(75);
  assert.equal((await health()).rooms,0,'explicit departure of all Blockies members closes room');
  console.log('PASS: Blockies '+versionLock.blockies.current+' live socket failover, host pause, room and board preservation, same-token reconnect');
}finally{
  if(blockiesHost)await close(blockiesHost);
  if(blockiesPartner)await close(blockiesPartner);
  if(blockiesRestoredHost)await close(blockiesRestoredHost);
}
