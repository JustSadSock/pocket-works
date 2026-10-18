import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import WebSocket from '../../pocket-server/node_modules/ws/index.js';
const origin=process.env.POCKETNET_TEST_URL||'http://127.0.0.1:8787';
const server=origin.replace(/^http/,'ws')+'/pocketnet/ws';
async function token(name){
 const res=await fetch(origin+'/pocketnet/session',{method:'POST',
  headers:{origin,'content-type':'application/json'},body:JSON.stringify({name})});
 assert.equal(res.status,200,'guest session');
 return (await res.json()).token;
}
async function connect(t){
 const ws=new WebSocket(server,{origin}),inbox=[],waiters=[],all=[];
 await new Promise((resolve,reject)=>{
  ws.once('open',resolve);ws.once('error',reject);
 });
 const ch={ws,all,
  send:(type,fields={})=>ws.send(JSON.stringify({wireVersion:1,type,...fields})),
  next:(type,check=()=>true)=>{
   const idx=inbox.findIndex(x=>x.type===type&&check(x));
   if(idx!==-1)return Promise.resolve(inbox.splice(idx,1)[0]);
   return new Promise((resolve,reject)=>{
    const w={type,check,resolve};waiters.push(w);
    setTimeout(()=>{
     const i=waiters.indexOf(w);
     if(i>=0){waiters.splice(i,1);reject(Error('Fog Worker timeout '+type+': '+JSON.stringify(inbox).slice(-1400)));}
    },10000).unref();
   });
  }
 };
 ws.on('message',raw=>{
  const msg=JSON.parse(String(raw));all.push(msg);
  const i=waiters.findIndex(w=>w.type===msg.type&&w.check(msg));
  if(i>=0){const [item]=waiters.splice(i,1);item.resolve(msg);}
  else inbox.push(msg);
 });
 ch.send('auth',{token:t});
 const auth=await ch.next('authenticated');
 ch.id=auth.player.id;
 return ch;
}
async function close(ch){
 if(!ch||ch.ws.readyState===WebSocket.CLOSED)return;
 await new Promise(resolve=>{
  ch.ws.once('close',resolve);ch.ws.close();
  setTimeout(()=>ch.ws.terminate(),1100).unref();
 });
}
function observe(ch,kind){
 return ch.next('game_event',x=>x.event?.type===kind);
}
async function run(){
 let response=null;
 for(let attempt=0;attempt<100;attempt++){
  try{
   const result=await fetch(origin+'/pocketnet/health');
   if(result.ok){response=result;break;}
  }catch{}
  await sleep(300);
 }
 assert.ok(response,'Cloudflare Wrangler did not become healthy within startup window');
 const health=await response.json();
 assert.equal(health.games['fog-of-conquest'].version,'v9');
 assert.equal(health.games['fog-of-conquest'].rulesVersion,8);
 const ta=await token('Fog northern'),tb=await token('Fog southern');
 let a=await connect(ta),b=await connect(tb);
 try{
  a.send('create_room',{gameId:'fog-of-conquest'});
  const made=await a.next('room_joined');
  assert.equal(made.version,'v9');
  const room=made.roomId;
  b.send('join_room',{roomId:room.slice(0,8).toUpperCase()});
  const joined=await b.next('room_joined');
  assert.equal(joined.state.side,2);
  assert.equal(made.state.side,1);
  a.send('game_message',{payload:{type:'start',size:'medium',requestId:'fog-start'}});
  const stA=await a.next('game_event',m=>m.event?.type==='state'&&m.event.payload?.phase==='battle');
  const stB=await b.next('game_event',m=>m.event?.type==='state'&&m.event.payload?.phase==='battle');
  assert.equal(stA.event.payload.phase,'battle');
  assert.equal(stB.event.payload.phase,'battle');
  assert.equal(stB.event.payload.game.units.some(u=>u.owner===1),false,'enemy unit leaked');
  let rev=stA.event.payload.game.revision;
  const command={type:'act',revision:rev,requestId:'fog-move-1',
    action:{type:'move',unit:stA.event.payload.game.units.find(x=>x.owner===1&&x.type==='swordsman').id,r:1,c:3}};
  a.send('game_message',{payload:command});
  const moved=await a.next('game_event',m=>m.event?.type==='state'&&m.event?.payload?.game?.revision===rev+1);
  assert.equal(moved.event.payload.game.units.find(x=>x.owner===1&&x.type==='swordsman').c,3);
  const e=await observe(a,'battle_event');
  assert.equal(e.event.payload.kind,'move');assert.deepEqual(e.event.payload.at,{r:1,c:3});
  assert.equal((await a.next('game_event',m=>m.event?.type==='ack'&&m.event.requestId==='fog-move-1')).event.requestId,'fog-move-1');
  a.send('game_message',{payload:command});
  const dup=await a.next('game_event',m=>m.event?.type==='ack'&&m.event.status==='duplicate');
  assert.equal(dup.event.revision,rev+1,'double move was not applied');
  a.send('game_message',{payload:{...command,requestId:'fog-stale'}});
  assert.match((await observe(a,'notice')).event.payload,/Устаревший/);
  // Reopen the same durable seat ten times, alternating the two real clients.
  for(let i=0;i<10;i++){
    if(i%2){
      await close(a);a=await connect(ta);a.send('join_room',{roomId:room});
      const restored=await a.next('room_joined');
      assert.equal(restored.state.side,1);
      assert.equal(restored.state.game.revision,rev+1);
      assert.equal(restored.state.game.battleHistory[2],undefined);
    }else{
      await close(b);b=await connect(tb);b.send('join_room',{roomId:room});
      const restored=await b.next('room_joined');
      assert.equal(restored.state.side,2);
      assert.equal(restored.state.game.revision,rev+1);
      assert.equal(restored.state.game.units.some(u=>u.owner===1),false);
      assert.equal(restored.state.game.battleHistory[1],undefined);
    }
  }
  a.send('game_message',{payload:{type:'act',revision:rev+1,requestId:'fog-end-1',action:{type:'end'}}});
  const ended=await a.next('game_event',m=>m.event?.type==='state'&&m.event?.payload?.game?.state?.currentPlayer===2);
  assert.equal(ended.event.payload.game.revision,rev+2);
  // South's move is concealed by the northern side's unexplored fog.
  const current=await b.next('game_event',m=>m.event?.type==='state'&&m.event?.payload?.game?.revision===rev+2);
  const own=current.event.payload.game.units.find(u=>u.owner===2&&u.type==='swordsman');
  const before=a.all.filter(m=>m.type==='game_event'&&m.event?.type==='battle_event'&&m.event.payload.kind==='move').length;
  let accepted=false;let target;
  for(const [dr,dc] of [[0,-1],[-1,0],[0,1],[1,0]]){
    b.send('game_message',{payload:{type:'act',revision:rev+2,requestId:'fog-south-'+dr+'-'+dc,
      action:{type:'move',unit:own.id,r:own.r+dr,c:own.c+dc}}});
    const outcome=await b.next('game_event',m=>['state','notice'].includes(m.event?.type)&&
      (m.event.type==='notice'||m.event?.payload?.game?.revision===rev+3));
    if(outcome.event.type==='state'){accepted=true;target={r:own.r+dr,c:own.c+dc};break;}
  }
  assert.equal(accepted,true,'No valid south move');
  const eventSouth=await b.next('game_event',m=>m.event?.type==='battle_event'&&m.event.payload.kind==='move');
  assert.deepEqual(eventSouth.event.payload.at,target);
  await sleep(90);
  assert.equal(a.all.filter(m=>m.type==='game_event'&&m.event?.type==='battle_event'&&m.event.payload.kind==='move').length,before,
    'Northern view received a hidden southern event');
  a.send('game_message',{payload:{type:'sync'}});
  const safe=await a.next('game_event',m=>m.event?.type==='state'&&m.event.to===a.id);
  assert.equal(safe.event.payload.game.battleHistory[2],undefined);
  assert.equal(safe.event.payload.game.units.some(u=>u.owner===2),false);
  b.send('game_message',{payload:{type:'resign',requestId:'fog-resign'}});
  const finished=await a.next('game_event',m=>m.event?.type==='state'&&m.event.payload.phase==='finished');
  assert.equal(finished.event.payload.game.winner,1);
  assert.ok(finished.event.payload.game.battleHistory[1].length>0);
  a.send('leave_room');b.send('leave_room');
  await sleep(120);
  console.log('PASS Fog real Durable Object: privacy, idempotency, 10 reconnects, live events, 2-seat game completion');
 }finally{await close(a);await close(b);}
 // Host departure in the real sqlite DO transfers the lobby to the guest.
 let x=await connect(ta),y=await connect(tb);
 try{
  x.send('create_room',{gameId:'fog-of-conquest'});
  const first=await x.next('room_joined');
  y.send('join_room',{roomId:first.roomId});await y.next('room_joined');
  x.send('leave_room');
  const changed=await y.next('game_event',m=>m.event?.type==='state'&&m.event.payload.host===y.id);
  assert.equal(changed.event.payload.phase,'lobby');
  y.send('leave_room');await sleep(100);
 }finally{await close(x);await close(y);}
}
await run();
