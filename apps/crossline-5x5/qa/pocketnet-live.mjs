// Live integration against a real Wrangler-managed PocketNet Worker, SQLite
// Durable Object, authenticated WebSockets and the pinned crossline-5x5 v2.
import assert from 'node:assert/strict';
import WebSocket from '../../../pocket-server/node_modules/ws/index.js';

const base=process.env.POCKETNET_TEST_URL||'http://127.0.0.1:8787';
const delay=ms=>new Promise(ok=>setTimeout(ok,ms));
async function health(){
 for(let attempt=0;attempt<90;attempt++){
  try{
   const response=await fetch(base+'/pocketnet/health');
   if(response.ok){const result=await response.json();if(result.ok)return result;}
  }catch{}
  await delay(350);
 }
 throw Error('Real PocketNet Worker unavailable at '+base);
}
async function session(name){
 const response=await fetch(base+'/pocketnet/session',{method:'POST',
  headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({name})});
 assert.equal(response.status,200,'create session');
 const body=await response.json();assert.ok(body.token);return body.token;
}
async function open(token){
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/pocketnet/ws',{origin:base});
 const queue=[],waiters=[];
 ws.on('message',raw=>{
  let packet;try{packet=JSON.parse(String(raw))}catch{return}
  const waiter=waiters.find(w=>w.type===packet.type&&w.match(packet));
  if(waiter){waiters.splice(waiters.indexOf(waiter),1);clearTimeout(waiter.timer);waiter.resolve(packet)}
  else queue.push(packet);
 });
 await Promise.race([
  new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)}),
  delay(12000).then(()=>{throw Error('WebSocket open timeout')})
 ]);
 const client={
  ws,queue,
  send(type,data={}){ws.send(JSON.stringify({wireVersion:1,type,...data}))},
  next(type,match=()=>true){
   const found=queue.findIndex(packet=>packet.type===type&&match(packet));
   if(found>=0)return Promise.resolve(queue.splice(found,1)[0]);
   return new Promise((resolve,reject)=>{
    const waiter={type,match,resolve,reject};
    waiter.timer=setTimeout(()=>{
     const i=waiters.indexOf(waiter);if(i>=0)waiters.splice(i,1);
     reject(Error('Timeout '+type+' queued='+JSON.stringify(queue).slice(0,2500)));
    },12000);
    waiters.push(waiter);
   });
  },
  async close(){
   if(ws.readyState===WebSocket.CLOSED)return;
   await Promise.race([new Promise(ok=>ws.once('close',ok)),delay(1100)]);
   if(ws.readyState!==WebSocket.CLOSED)ws.terminate();
  }
 };
 client.send('auth',{token});
 await client.next('authenticated');
 return client;
}
const five=['up','down','left','right','shield'];
const compact=m=>m.event?.payload;
const stateEvent=(phase,extra=()=>true)=>m=>m.event?.type==='state'&&compact(m)?.phase===phase&&extra(compact(m));
let alice,bob,reconnected;
const healthBefore=await health();
assert.ok(healthBefore.modules.includes('crossline-5x5'),'real Worker must publish Arena module');
const aToken=await session('Arena Alpha'),bToken=await session('Arena Beta');
try{
 alice=await open(aToken);bob=await open(bToken);
 alice.send('create_room',{gameId:'crossline-5x5'});
 const initial=await alice.next('room_joined');
 assert.equal(initial.version,'v2');
 assert.equal(initial.state.phase,'lobby');
 assert.equal(initial.state.players.length,1);
 const roomId=initial.roomId,code=roomId.slice(0,8).toUpperCase();
 bob.send('join_room',{roomId:code});
 const joined=await bob.next('room_joined');
 assert.equal(joined.version,'v2');assert.equal(joined.state.side,'B');
 alice.send('game_message',{payload:{type:'start'}});
 const startA=await alice.next('game_event',stateEvent('planning'));
 const startB=await bob.next('game_event',stateEvent('planning'));
 assert.equal(startA.event.payload.side,'A');
 assert.equal(startB.event.payload.side,'B');
 assert.equal(startA.event.payload.ownPlan.length,0);

 // Only A submits. B learns A is ready, never A's five secret commands.
 alice.send('game_message',{payload:{type:'plan',round:1,revision:0,actions:five}});
 const waiting=await bob.next('game_event',stateEvent('planning',s=>s.ready?.A));
 assert.equal(waiting.event.payload.ownPlan.length,0);
 assert.ok(!JSON.stringify(waiting.event.payload).includes('"ownPlan":["up","down","left"'),
  'B received hidden A plan');
 // Disconnect the transport: it must NOT forfeit the room or clear A's plan.
 await alice.close();
 reconnected=await open(aToken);
 reconnected.send('join_room',{roomId});
 const restored=await reconnected.next('room_joined');
 assert.equal(restored.roomId,roomId);
 assert.equal(restored.state.side,'A');
 assert.deepEqual(restored.state.ownPlan,five);
 assert.equal(restored.state.phase,'planning');
 assert.equal(restored.state.match.revision,0);
 bob.send('game_message',{payload:{type:'plan',round:1,revision:0,actions:five}});
 const roundA=await reconnected.next('game_event',stateEvent('planning',s=>s.match?.revision===1));
 const roundB=await bob.next('game_event',stateEvent('planning',s=>s.match?.revision===1));
 assert.equal(roundA.event.payload.match.replays.length,1);
 assert.deepEqual(roundA.event.payload.match.replays[0].plans.B,five);
 assert.deepEqual(roundB.event.payload.match.replays[0].plans.A,five);
 // Reject stale orders without changing the authoritative revision.
 bob.send('game_message',{payload:{type:'plan',round:1,revision:0,actions:five}});
 const notice=await bob.next('game_event',m=>m.event?.type==='notice');
 assert.match(String(notice.event.payload),/Устаревший раунд/);
 // A surrenders round 2; result must reach B and increment score once.
 reconnected.send('game_message',{payload:{type:'forfeit'}});
 const result=await bob.next('game_event',stateEvent('finished'));
 assert.equal(result.event.payload.match.outcome,'B');
 assert.equal(result.event.payload.score.B,1);
 assert.equal(result.event.payload.match.termination.reason,'surrender');
 const done=await reconnected.next('game_event',stateEvent('finished'));
 assert.equal(done.event.payload.score.B,1);
 // The host can rematch, preserving score but beginning from a fresh board.
 reconnected.send('game_message',{payload:{type:'rematch'}});
 const again=await bob.next('game_event',stateEvent('planning',s=>s.match?.revision===0));
 assert.equal(again.event.payload.score.B,1);
 assert.equal(again.event.payload.match.round,1);
 // Explicit guest exit, unlike transport loss, awards A and maintains result.
 bob.send('leave_room');
 const left=await reconnected.next('game_event',stateEvent('finished',s=>s.match?.termination?.reason==='left_room'));
 assert.equal(left.event.payload.match.outcome,'A');
 assert.equal(left.event.payload.score.A,1);
 console.log('LIVE_POCKETNET_PASS',JSON.stringify({roomId,version:initial.version,reconnect:true,privateOrders:true,rounds:1,surrender:true,rematch:true,leave:true}));
}finally{
 for(const c of [alice,bob,reconnected])try{await c?.close()}catch{}
}
