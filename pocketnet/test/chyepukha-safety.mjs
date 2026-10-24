// Real local Worker / Durable Object regression, not a simulated game module.
// Covers commit-before-ack, duplicate send, vacant seats and partial issue.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const versionLock=JSON.parse(await readFile(new URL('../modules.lock.json',import.meta.url),'utf8'));
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
 const inbox=[],waiters=[],received=[];
 const next=(type,filter=()=>true)=>new Promise((resolve,reject)=>{
  const i=inbox.findIndex(x=>x.type===type&&filter(x));
  if(i>=0){resolve(inbox.splice(i,1)[0]);return}
  const waiter={type,filter,resolve,reject};waiters.push(waiter);
  const timer=setTimeout(()=>{const j=waiters.indexOf(waiter);if(j>=0){waiters.splice(j,1);reject(Error('No '+type+'; inbox: '+JSON.stringify(inbox.slice(-8))))}},8000);
  timer.unref?.();
 });
 ws.on('message',raw=>{
  const data=JSON.parse(String(raw)),index=waiters.findIndex(x=>x.type===data.type&&x.filter(data));
  received.push(data);
  if(index>=0)waiters.splice(index,1)[0].resolve(data);else inbox.push(data);
 });
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
 ws.send(JSON.stringify({wireVersion:1,type:'auth',token}));
 const auth=await next('authenticated');
 return {id:auth.player.id,ws,next,received,send:(type,extra={})=>ws.send(JSON.stringify({wireVersion:1,type,...extra}))};
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
 assert.equal(created.version,versionLock.chyepukha.current);
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
 const beforePeerSync=guest.received.filter(m=>m.type==='game_event'&&m.event?.type==='state').length;
 host.send('game_message',{payload:{type:'sync'}});
 const afterReplay=await host.next('game_event',m=>m.event?.type==='state'&&m.event.payload.revision===original);
 assert.equal(afterReplay.event.payload.revision,original);
 // Read-only sync is private: the peer must not receive an extra snapshot.
 await sleep(120);
 assert.equal(guest.received.filter(m=>m.type==='game_event'&&m.event?.type==='state').length,beforePeerSync);
 // Repeated syncs on this socket are coalesced instead of triggering new work.
 const beforeBurst=host.received.filter(m=>m.type==='game_event'&&m.event?.type==='state').length;
 for(let i=0;i<8;i++)host.send('game_message',{payload:{type:'sync'}});
 await sleep(150);
 assert.equal(host.received.filter(m=>m.type==='game_event'&&m.event?.type==='state').length,beforeBurst);
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
 // End early only by the original owner. Incomplete future chapters stay absent.
 guest.send('game_message',{payload:{type:'finish_early'}});
 assert.equal((await guest.next('game_event',m=>m.event?.type==='notice')).event.type,'notice');
 host.send('game_message',{payload:{type:'finish_early'}});
 const final=await guest.next('game_event',m=>m.event?.type==='state'&&m.event.payload.phase==='finished');
 assert.equal(final.event.payload.stories.length,2);
 assert.ok(final.event.payload.stories.every(story=>story.fragments.length===1));
 // The finished issue supports one private, server-authoritative reaction per seat.
 const firstStory=final.event.payload.stories[0].id;
 guest.send('game_message',{payload:{type:'react_story',storyId:firstStory,reaction:'laugh'}});
 const hostVote=await host.next('game_event',m=>m.event?.type==='state'&&m.event.payload.reactionTotals?.[firstStory]?.laugh===1);
 assert.equal(hostVote.event.payload.myReactions[firstStory],undefined,'peer choice must stay private');
 const guestVote=await guest.next('game_event',m=>m.event?.type==='state'&&m.event.payload.myReactions?.[firstStory]==='laugh');
 assert.equal(guestVote.event.payload.reactionTotals[firstStory].laugh,1);
 host.send('game_message',{payload:{type:'react_story',storyId:firstStory,reaction:'surprised'}});
 const combined=await guest.next('game_event',m=>m.event?.type==='state'&&m.event.payload.reactionTotals?.[firstStory]?.surprised===1);
 assert.equal(combined.event.payload.reactionTotals[firstStory].laugh,1);
 guest.send('game_message',{payload:{type:'react_story',storyId:firstStory,reaction:'laugh'}});
 const cleared=await host.next('game_event',m=>m.event?.type==='state'&&m.event.payload.reactionTotals?.[firstStory]?.laugh===0&&m.event.payload.reactionTotals[firstStory].surprised===1);
 assert.equal(cleared.event.payload.reactionTotals[firstStory].surprised,1);
 guest.send('game_message',{payload:{type:'react_story',storyId:'not-a-story',reaction:'laugh'}});
 assert.equal((await guest.next('game_event',m=>m.event?.type==='notice')).event.type,'notice');
 // Create another protected room to verify moderator actions through real WebSockets.
 host.send('leave_room');guest.send('leave_room');
 await sleep(80);
 host.send('create_room',{gameId:'chyepukha'});
 const newRoom=await host.next('room_joined',m=>m.roomId!==roomId);
 const modRoom=newRoom.roomId;
 guest.send('join_room',{roomId:modRoom});
 await guest.next('room_joined',m=>m.roomId===modRoom);
 host.send('game_message',{payload:{type:'start'}});
 await host.next('game_event',m=>m.event?.type==='state'&&m.event.payload.phase==='writing'&&m.roomId===modRoom);
 host.send('game_message',{payload:{type:'pause'}});
 const paused=await host.next('game_event',m=>m.event?.type==='state'&&m.event.payload.paused&&m.roomId===modRoom);
 assert.equal(paused.event.payload.paused,true);
 host.send('game_message',{payload:{type:'unpause'}});
 await host.next('game_event',m=>m.event?.type==='state'&&!m.event.payload.paused&&m.roomId===modRoom);
 host.send('game_message',{payload:{type:'kick',seatId:guestId}});
 const evicted=await guest.next('room_kicked');
 assert.equal(evicted.roomId,modRoom);
 guest.send('join_room',{roomId:modRoom});
 assert.equal((await guest.next('error',m=>m.code==='room_kicked')).code,'room_kicked');
 host.send('game_message',{payload:{type:'open_seat',seatId:guestId}});
 const ticket=await host.next('game_event',m=>m.event?.type==='state'&&m.event.payload.claim?.code&&m.roomId===modRoom);
 const claimCode=ticket.event.payload.claim.code;
 const replacement=await channel(await session('Chy Replacement'));
 try{
  replacement.send('join_room',{roomId:modRoom,claimCode});
  const entered=await replacement.next('room_joined');
  assert.equal(entered.state.players.length,2);
  assert.equal(entered.state.claim,null);
  assert.equal(entered.state.players.some(p=>p.id===guestId),false);
  assert.equal(entered.state.players.some(p=>p.id===replacement.id),true);
  replacement.send('game_message',{payload:{type:'pause'}});
  assert.equal((await replacement.next('game_event',m=>m.event?.type==='notice')).event.type,'notice');
  host.send('game_message',{payload:{type:'finish_early'}});
  const release=await replacement.next('game_event',m=>m.event?.type==='state'&&m.event.payload.phase==='finished');
  assert.equal(release.event.payload.stories.length,2);
 }finally{await shutdown(replacement)}
 // A reconnecting author cancels the stale one-time seat ticket. This must
 // stay cancelled after that author disconnects again (real Durable Object).
 host.send('leave_room');
 await sleep(80);
 host.send('create_room',{gameId:'chyepukha'});
 const recoveryRoom=await host.next('room_joined',m=>m.roomId!==modRoom);
 guest.send('join_room',{roomId:recoveryRoom.roomId});
 await guest.next('room_joined',m=>m.roomId===recoveryRoom.roomId);
 host.send('game_message',{payload:{type:'start'}});
 await host.next('game_event',m=>m.event?.type==='state'&&m.event.payload.phase==='writing'&&m.roomId===recoveryRoom.roomId);
 guest.send('leave_room');
 await host.next('game_event',m=>m.event?.type==='state'&&m.event.payload.players.some(p=>p.id===guestId&&p.departed)&&m.roomId===recoveryRoom.roomId);
 host.send('game_message',{payload:{type:'open_seat',seatId:guestId}});
 const claimEvent=await host.next('game_event',m=>m.event?.type==='state'&&m.event.payload.claim?.code&&m.roomId===recoveryRoom.roomId);
 const staleTicket=claimEvent.event.payload.claim.code;
 guest.send('join_room',{roomId:recoveryRoom.roomId});
 const authorReturn=await guest.next('room_joined',m=>m.roomId===recoveryRoom.roomId);
 assert.equal(authorReturn.state.claim,null,'rejoining author cancels replacement claim');
 guest.send('leave_room');
 await host.next('game_event',m=>m.event?.type==='state'&&m.event.payload.players.some(p=>p.id===guestId&&p.departed)&&m.roomId===recoveryRoom.roomId&&m.event.payload.claim===null);
 const hijacker=await channel(await session('Chy Stale Code'));
 try{
  hijacker.send('join_room',{roomId:recoveryRoom.roomId,claimCode:staleTicket});
  const denied=await hijacker.next('error',m=>m.code==='invalid_replacement_code');
  assert.equal(denied.code,'invalid_replacement_code');
 }finally{await shutdown(hijacker)}
 console.log('Chyepukha current: safe pause, server-authorized kick, no rejoin and one-time seat replacement');
 console.log('Chyepukha current: durable seat rejoin, idempotent receipts and partial story survive');
}finally{await Promise.allSettled([shutdown(host),shutdown(guest)])}
