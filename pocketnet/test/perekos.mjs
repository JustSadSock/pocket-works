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

const status=await (await fetch(base+'/pocketnet/health')).json();
assert.equal(status.ok,true);
assert.ok(status.modules.includes('perekos'),'Perekos snapshot not loaded by Edge');
const [a,b,c]=await Promise.all([token('Perekos A'),token('Perekos B'),token('Perekos Third')]);
const host=await client(a),guest=await client(b),third=await client(c);
let rejoined=null;
const idle=(ms=125)=>new Promise(resolve=>setTimeout(resolve,ms));
const receive=(who,phase)=>who.next('game_event',m=>m.event.type==='state'&&m.event.payload?.phase===phase);
try{
 host.send('create_room',{gameId:'perekos'});
 const opened=await host.next('room_joined');const room=opened.roomId,code=room.slice(0,8);
 assert.equal(opened.version,'v9','The current Perekos room must use the pinned v9 ruleset');assert.equal(opened.state.rulesVersion,9);assert.equal(opened.state.gameMode,'rupture');assert.equal(opened.state.phase,'lobby');assert.equal(opened.state.me,0);
 guest.send('join_room',{roomId:code.toUpperCase()});
 const joined=await guest.next('room_joined');assert.equal(joined.state.me,1);assert.equal(joined.roomId,room);
 assert.equal(joined.state.players.length,2);
 third.send('join_room',{roomId:code});assert.equal((await third.next('error')).code,'room_full');
 guest.send('game_message',{payload:{type:'start'}});
 assert.match((await guest.next('game_event',m=>m.event.type==='notice')).event.payload,/создатель/i);
 host.send('game_message',{payload:{type:'mode',gameMode:'duel'}});
 const selectedMode=(await host.next('game_event',m=>m.event.type==='state'&&m.event.payload?.gameMode==='duel')).event.payload;
 assert.equal(selectedMode.gameMode,'duel');
 host.send('game_message',{payload:{type:'start',gameMode:'duel'}});
 const started=(await receive(host,'fight')).event.payload;
 assert.equal(started.rulesVersion,9);assert.equal(started.match.gameMode,'duel');assert.equal(started.match.version,4);assert.equal(started.match.round,1);assert.deepEqual(started.match.score,[0,0]);
 const startX=started.match.actors[0].x;
 const ctl=(x=0)=>({x,y:0,aim:{x:320,y:140},attack:false,shield:false,dash:false});
 host.send('game_message',{payload:{type:'input',seq:0,round:1,control:ctl(999)}});
 assert.match((await host.next('game_event',m=>m.event.type==='notice')).event.payload,/Неверная/i);
 let latest=started;
 for(let i=1;i<=18;i++){
  await idle(90);
  host.send('game_message',{payload:{type:'input',seq:i,round:1,control:ctl(.85)}});
  guest.send('game_message',{payload:{type:'input',seq:i,round:1,control:ctl(0)}});
  latest=(await receive(host,'fight')).event.payload;
 }
 assert.ok(latest.match.actors[0].x>startX,'Only authoritative inputs should move fighter');
 assert.equal(latest.match.actors[1].hp,100,'No forged damage');
 const originalScore=latest.match.score.join(':');
 await close(guest);
 rejoined=await client(b);rejoined.send('join_room',{roomId:code});
 const resumed=await rejoined.next('room_joined');
 assert.equal(resumed.state.me,1);assert.ok(resumed.state.nextSeq>0,'Reconnect must return server-side next input sequence');assert.equal(resumed.state.match.score.join(':'),originalScore);
 assert.equal(resumed.state.match.actors[0].runes.join(','),'on_hurt,armor');
 rejoined.send('game_message',{payload:{type:'input',seq:resumed.state.nextSeq,round:1,control:ctl(-.4)}});
 await idle(150);
 host.send('game_message',{payload:{type:'input',seq:19,round:1,control:ctl(0)}});
 const afterReconnect=(await receive(rejoined,'fight')).event.payload;
 assert.ok(afterReconnect.nextSeq>resumed.state.nextSeq,'Recovered seat must accept the next input immediately');
 rejoined.send('leave_room');
 const finished=(await receive(host,'result')).event.payload;
 assert.equal(finished.match.champion,0);
 assert.equal(finished.match.score[0],4);
 rejoined.send('join_room',{roomId:code});
 const seatBack=await rejoined.next('room_joined');assert.equal(seatBack.state.me,1);
 host.send('game_message',{payload:{type:'rematch'}});
 const replay=(await receive(host,'fight')).event.payload;
 assert.equal(replay.match.round,1);assert.deepEqual(replay.match.score,[0,0]);
 rejoined.send('leave_room');await receive(host,'result');
 host.send('leave_room');
 console.log('PASS Perekos PocketNet Edge: 2 clients, server physics, room cap, cheat rejection, reconnect, forfeit and rematch');
}finally{await Promise.all([close(host),close(guest),close(rejoined),close(third)])}
