// Real local Worker / Durable Object regression, not a simulated game module.
// Covers commit-before-ack, duplicate send, vacant seats and partial issue.
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import WebSocket from '../../pocket-server/node_modules/ws/index.js';
const base=process.env.POCKETNET_TEST_URL||'http://127.0.0.1:8787';
async function session(name){
 const response=await fetch(base+'/pocketnet/session',{method:'POST',
  headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({name})});
 assert.equal(response.status,200);return (await response.json()).token;
}
async function channel(token){
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/pocketnet/ws',{origin:base});
 const inbox=[],waiters=[];
 const next=(type,filter=()=>true)=>new Promise((resolve,reject)=>{
  const i=inbox.findIndex(x=>x.type===type&&filter(x));
  if(i>=0){resolve(inbox.splice(i,1)[0]);return}
  const waiter={type,filter,resolve,reject};waiters.push(waiter);
  const timer=setTimeout(()=>{const j=waiters.indexOf(waiter);if(j>=0){waiters.splice(j,1);reject(Error('No '+type+'; inbox: '+JSON.stringify(inbox.slice(-8))))}},8000);
  timer.unref?.();
 });
 ws.on('message',raw=>{
  const data=JSON.parse(String(raw)),index=waiters.findIndex(x=>x.type===data.type&&x.filter(data));
  if(index>=0)waiters.splice(index,1)[0].resolve(data);else inbox.push(data);
 });
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
 ws.send(JSON.stringify({wireVersion:1,type:'auth',token}));
 await next('authenticated');
 return {ws,next,send:(type,extra={})=>ws.send(JSON.stringify({wireVersion:1,type,...extra}))};
}
async function shutdown(c){
 if(c.ws.readyState===WebSocket.CLOSED)return;
 const p=new Promise(resolve=>{c.ws.once('close',resolve);setTimeout(()=>c.ws.terminate(),1500).unref()});
 c.ws.close();await p;
}
const host=await channel(await session('Chy Host'));
const guest=await channel(await session('Chy Guest'));
try{
 host.send('create_room',{gameId:'chyepukha'});
 const created=await host.next('room_joined');
 assert.equal(created.version,'v6');
 const roomId=created.roomId,hostId=created.players[0].id;
 guest.send('join_room',{roomId});
 const joined=await guest.next('room_joined');
 assert.equal(joined.state.players.length,2);
 const guestId=joined.players.find(p=>p.id!==hostId)?.id;
 assert.ok(guestId);
 host.send('game_message',{payload:{type:'start'}});
 const first=await host.next('game_event',m=>m.event?.type==='state'&&m.event.payload.phase==='writing');
 const second=await guest.next('game_event',m=>m.event?.type==='state'&&m.event.payload.phase==='writing');
 const make=(state,id)=>({type:'submit',requestId:'durable_'+id+'_abcdefgh1234',round:state.round,
  sheetId:state.sheet.id,answer:'Вчора старий кіт випадково загубив свою чарівну карту у лісі',
  tailIndexes:[0,2,4],gender:'unspecified'});
 const a=make(first.event.payload,'host');
 host.send('game_message',{payload:a});
 const accepted=await host.next('game_event',m=>m.event?.type==='receipt'&&m.event.payload.requestId===a.requestId);
 assert.equal(accepted.event.payload.accepted,true);
 const original=(await host.next('game_event',m=>m.event?.type==='state'&&m.event.payload.players.find(p=>p.id===hostId)?.submitted)).event.payload.revision;
 host.send('game_message',{payload:a});
 await host.next('game_event',m=>m.event?.type==='receipt'&&m.event.payload.requestId===a.requestId);
 host.send('game_message',{payload:{type:'sync'}});
 const afterReplay=await host.next('game_event',m=>m.event?.type==='state'&&m.event.payload.revision===original);
 assert.equal(afterReplay.event.payload.revision,original);
 const b=make(second.event.payload,'guest');
 guest.send('game_message',{payload:b});
 const roundTwo=await host.next('game_event',m=>m.event?.type==='state'&&m.event.payload.round===1);
 assert.equal(roundTwo.event.payload.round,1);
 guest.send('leave_room');
 const afterLeave=await host.next('game_event',m=>m.event?.type==='state'&&m.event.payload.players.some(p=>p.id===guestId&&p.departed));
 assert.equal(afterLeave.event.payload.phase,'writing');
 assert.equal(afterLeave.event.payload.round,1);
 host.send('leave_room');
 await sleep(90);
 // Both sockets are still alive, but the room has zero registered members.
 host.send('join_room',{roomId});
 const recovered=await host.next('room_joined');
 assert.equal(recovered.state.phase,'writing');
 assert.equal(recovered.state.round,1);
 assert.equal(recovered.state.players.length,2);
 guest.send('join_room',{roomId});
 const restoreGuest=await guest.next('room_joined');
 assert.equal(restoreGuest.state.players.length,2);
 assert.equal(restoreGuest.state.players.some(p=>p.id===guestId&&p.departed),false);
 // Moderation runs on the real Worker, never on client-only state.
 guest.send('game_message',{payload:{type:'pause'}});
 await guest.next('game_event',m=>m.event?.type==='notice');
 host.send('game_message',{payload:{type:'pause'}});
 await host.next('game_event',m=>m.event?.type==='state'&&m.event.payload.paused===true);
 host.send('game_message',{payload:{type:'resume'}});
 await host.next('game_event',m=>m.event?.type==='state'&&m.event.payload.paused===false);
 guest.send('game_message',{payload:{type:'finish_early'}});
 await guest.next('game_event',m=>m.event?.type==='notice');
 host.send('game_message',{payload:{type:'kick',targetId:guestId}});
 await guest.next('room_kicked');
 const candidate=await channel(await session('Chy Replacement'));
 try{
  candidate.send('join_room',{roomId});
  const queued=await candidate.next('room_joined');
  assert.equal(queued.state.waitingApproval,true);
  assert.equal(queued.state.sheet,undefined);
  const candidateId=queued.players.find(p=>p.id!==hostId)?.id;
  assert.ok(candidateId);
  host.send('game_message',{payload:{type:'assign_seat',seatId:guestId,candidateId}});
  const assigned=await candidate.next('game_event',m=>m.event?.type==='state'&&m.event.payload.players.some(p=>p.id===candidateId&&!p.vacant));
  assert.ok(assigned.event.payload.sheet);
  assert.equal(assigned.event.payload.round,1);
  host.send('game_message',{payload:{type:'finish_early'}});
  const final=await candidate.next('game_event',m=>m.event?.type==='state'&&m.event.payload.phase==='finished');
  assert.equal(final.event.payload.stories.length,2);
  assert.ok(final.event.payload.stories.every(story=>story.fragments.length===1));
 }finally{await shutdown(candidate);}
 guest.send('join_room',{roomId});
 const rejected=await guest.next('error');
 assert.equal(rejected.code,'room_kicked');
 console.log('Chyepukha v6: persisted rooms, pause, server kicks, candidate replacement and finished stories');
}finally{await Promise.allSettled([shutdown(host),shutdown(guest)])}
