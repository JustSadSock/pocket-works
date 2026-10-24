// Eight real WebSocket clients against the local PocketNet Durable Object.
// All ten rounds, UTF-8 payloads, duplicate sends and socket replacement are exercised.
// This must run after a local Wrangler Worker is started by pocketnet-edge.yml.
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import WebSocket from '../../pocket-server/node_modules/ws/index.js';

const base=process.env.POCKETNET_TEST_URL||'http://127.0.0.1:8787';
const authorCount=8,roundCount=10,deadlineMs=20_000;
const tokens=[];
async function session(name){
 // Edge QA reuses one local IP across several suites. Respect the production
 // admission rate limit rather than bypassing it or weakening the server.
 for(let attempt=0;attempt<3;attempt++){
  const res=await fetch(base+'/pocketnet/session',{method:'POST',
   headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({name})});
  if(res.status===200)return (await res.json()).token;
  if(res.status!==429||attempt===2)throw Error('PocketNet session '+name+': HTTP '+res.status);
  const retryAfter=Number(res.headers.get('retry-after'));
  assert.ok(Number.isFinite(retryAfter)&&retryAfter>0&&retryAfter<=65,'bounded Retry-After');
  console.log('Chyepukha load respects PocketNet admission window ('+retryAfter+' s)');
  await sleep((retryAfter+1)*1000);
 }
 throw Error('unreachable');
}
async function connect(token){
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/pocketnet/ws',{origin:base});
 const inbox=[],waiters=[];
 let latest=null,received=0,maxReceived=0;
 function next(type,condition=()=>true){
  const index=inbox.findIndex(x=>x.type===type&&condition(x));
  if(index>=0)return Promise.resolve(inbox.splice(index,1)[0]);
  return new Promise((resolve,reject)=>{
   const waiter={type,condition,resolve,reject};
   const timer=setTimeout(()=>{
    const index=waiters.indexOf(waiter);
    if(index>=0)waiters.splice(index,1);
    reject(Error('Timed out waiting for '+type+' (last view: '+JSON.stringify({
      round:latest?.round,phase:latest?.phase,waiting:latest?.waiting,
      stored:inbox.length,received
    })+')'));
   },deadlineMs);timer.unref?.();
   waiter.resolve=value=>{clearTimeout(timer);resolve(value)};
   waiters.push(waiter);
  });
 }
 ws.on('message',raw=>{
  const packet=JSON.parse(String(raw));
  received++;
  maxReceived=Math.max(maxReceived,Buffer.byteLength(String(raw)));
  if(packet.type==='room_joined'&&packet.state)latest=packet.state;
  if(packet.type==='game_event'&&packet.event?.type==='state'){
   // Every recipient gets its private view, never a shared plaintext room blob.
   latest=packet.event.payload;
  }
  const index=waiters.findIndex(x=>x.type===packet.type&&x.condition(packet));
  if(index>=0)waiters.splice(index,1)[0].resolve(packet);
  else {inbox.push(packet);if(inbox.length>80)inbox.shift();}
 });
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
 ws.send(JSON.stringify({wireVersion:1,type:'auth',token}));
 const auth=await next('authenticated');
 return {
  id:auth.player.id,ws,next,token,
  get latest(){return latest},get received(){return received},get maxReceived(){return maxReceived},
  send(type,extra={}){ws.send(JSON.stringify({wireVersion:1,type,...extra}))}
 };
}
async function shutdown(client){
 if(client.ws.readyState===WebSocket.CLOSED)return;
 if(client.ws.readyState===WebSocket.CONNECTING){client.ws.terminate();return;}
 const closed=new Promise(resolve=>{
  client.ws.once('close',resolve);
  setTimeout(()=>client.ws.terminate(),2000).unref?.();
 });
 client.ws.close();await closed;
}
function answer(round,index){
 return ['Аркуш'+round+'Автор'+index,...Array(3).fill('界'.repeat(210))].join(' ');
}
async function waitWriting(client,round){
 if(client.latest?.round===round&&client.latest?.phase==='writing'&&!client.latest.waiting)return client.latest;
 const arrived=await client.next('game_event',p=>p.event?.type==='state'&&
   p.event.payload.phase==='writing'&&p.event.payload.round===round&&!p.event.payload.waiting);
 return arrived.event.payload;
}
const peers=[];
let reconnects=0,duplicates=0,submitted=0,maxRoomWire=0,roomId='';
try{
 for(let i=0;i<authorCount;i++)tokens.push(await session('Chy load '+i));
 peers.push(await connect(tokens[0]));
 peers[0].send('create_room',{gameId:'chyepukha',payload:{
  settings:{maxPlayers:authorCount,questionSet:'collapsingPlan',
   genre:'absurdComedy',visibleTailWords:3,showNextQuestion:true}
 }});
 const created=await peers[0].next('room_joined');
 assert.equal(created.version,'v10');
 roomId=created.roomId;
 for(let i=1;i<authorCount;i++){
  const peer=await connect(tokens[i]);peers.push(peer);
  peer.send('join_room',{roomId});
  const joined=await peer.next('room_joined');
  assert.equal(joined.roomId,roomId);
  assert.equal(joined.players.length,i+1);
 }
 peers[0].send('game_message',{payload:{type:'start'}});
 for(let round=0;round<roundCount;round++){
  // Rejoin a previously registered durable identity with a fresh WebSocket
  // while other authors are active and the manuscript state is persisted.
  if(round===5){
   const old=peers[5],identity=old.id;
   await shutdown(old);
   const replacement=await connect(tokens[5]);
   assert.equal(replacement.id,identity,'durable identity must remain stable');
   replacement.send('join_room',{roomId});
   const joined=await replacement.next('room_joined');
   assert.equal(joined.state.phase,'writing');
   assert.equal(joined.state.round,round);
   assert.equal(joined.players.length,authorCount);
   peers[5]=replacement;reconnects++;
  }
  for(let i=0;i<authorCount;i++){
   const peer=peers[i],state=await waitWriting(peer,round);
   assert.ok(state.sheet?.id,'correct private writing view');
   assert.equal(state.players.length,authorCount);
   assert.equal(state.issue,1);
   const requestId='load_'+round+'_'+i+'_abcdefghijklmno';
   const payload={type:'submit',requestId,round,sheetId:state.sheet.id,
    answer:answer(round,i),tailIndexes:round===roundCount-1?[]:[0,1,2],
    gender:'unspecified'};
   peer.send('game_message',{payload});
   const ack=await peer.next('game_event',p=>p.event?.type==='receipt'&&p.event.payload?.requestId===requestId);
   assert.equal(ack.event.payload.accepted,true,'server must commit before receipt');
   submitted++;
   if(i===0&&round%2===0){
    peer.send('game_message',{payload});
    const retried=await peer.next('game_event',p=>p.event?.type==='receipt'&&p.event.payload?.requestId===requestId);
    assert.equal(retried.event.payload.accepted,true,'repeat receipt remains idempotent');
    duplicates++;
   }
  }
  // Every peer must receive a monotonically advanced new turn.
  if(round<roundCount-1){
   for(const peer of peers){
    if(peer.latest?.round===round+1)continue;
    await peer.next('game_event',p=>p.event?.type==='state'&&p.event.payload?.round===round+1);
   }
  }
 }
 for(const peer of peers){
  const result=peer.latest?.phase==='finished'&&peer.latest.stories?.length===authorCount
   ?peer.latest:(await peer.next('game_event',p=>p.event?.type==='state'&&p.event.payload?.phase==='finished')).event.payload;
  assert.equal(result.stories.length,authorCount);
  assert.ok(result.stories.every(s=>s.fragments.length===roundCount));
  assert.equal(result.players.length,authorCount);
  assert.equal(result.reactionTotals[result.stories[0].id].laugh,0);
  maxRoomWire=Math.max(maxRoomWire,Buffer.byteLength(JSON.stringify(result)));
 }
 assert.equal(submitted,80);
 assert.equal(duplicates,5);
 assert.equal(reconnects,1);
 assert.ok(maxRoomWire<256*1024,'eight full manuscripts must fit one final state event');
 assert.ok(peers.every(x=>x.maxReceived<256*1024),'no inbound packet may exceed 256KiB');
 console.log('Chyepukha real 8-author durability: '+submitted+' UTF-8 answers, '+
  duplicates+' receipt replays, '+reconnects+' socket reconnection; '+
  'max reader view '+maxRoomWire+' bytes, max wire '+Math.max(...peers.map(x=>x.maxReceived))+' bytes');
}finally{
 await Promise.allSettled(peers.map(shutdown));
}
