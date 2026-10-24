// Two authenticated actors against a real local PocketNet Durable Object.
// Verifies room lifecycle and that prior footage/voice epochs cannot unlock
// the next selected scene.
import assert from 'node:assert/strict';
import WebSocket from '../../../pocket-server/node_modules/ws/index.js';

const base=process.env.POCKETNET_TEST_URL||'http://127.0.0.1:8787';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const event=(phase,check=()=>true)=>p=>p.event?.type==='state'&&p.event.payload?.phase===phase&&check(p.event.payload);
async function health(){
 for(let i=0;i<100;i++){
  try{
   const r=await fetch(base+'/pocketnet/health');
   if(r.ok){const result=await r.json();if(result.ok)return result}
  }catch{}
  await delay(300);
 }
 throw Error('PocketNet health endpoint did not start.');
}
async function getToken(name){
 const r=await fetch(base+'/pocketnet/session',{
  method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({name})
 });
 assert.equal(r.status,200);return (await r.json()).token;
}
async function actor(token){
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/pocketnet/ws',{origin:base});
 const messages=[],waiters=[];
 ws.on('message',raw=>{
  let packet;try{packet=JSON.parse(String(raw))}catch{return}
  const index=waiters.findIndex(w=>w.type===packet.type&&w.match(packet));
  if(index>=0){
   const w=waiters.splice(index,1)[0];clearTimeout(w.timer);w.resolve(packet);
  }else messages.push(packet);
 });
 await Promise.race([
  new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)}),
  delay(12000).then(()=>{throw Error('WebSocket connection timed out')})
 ]);
 const client={
  ws,
  send(type,fields={}){ws.send(JSON.stringify({wireVersion:1,type,...fields}))},
  next(type,match=()=>true,timeout=12000){
   const i=messages.findIndex(p=>p.type===type&&match(p));
   if(i>=0)return Promise.resolve(messages.splice(i,1)[0]);
   return new Promise((resolve,reject)=>{
    const w={type,match,resolve,reject};
    w.timer=setTimeout(()=>{
     const i=waiters.indexOf(w);if(i!==-1)waiters.splice(i,1);
     reject(Error('Missing '+type+': '+JSON.stringify(messages.slice(-4)).slice(0,1500)));
    },timeout);
    waiters.push(w);
   });
  },
  close(){ws.close();setTimeout(()=>{if(ws.readyState!==WebSocket.CLOSED)ws.terminate()},1000).unref()}
 };
 client.send('auth',{token});
 client.id=(await client.next('authenticated')).player.id;
 return client;
}
const clients=[];
const ready=await health();
assert(ready.modules.includes('ne-tem-golosom'),'PocketNet must publish Ne Tem Golosom');
try{
 const [host,guest]=await Promise.all(['NTG Host','NTG Guest'].map(async name=>{
  const c=await actor(await getToken(name));clients.push(c);return c;
 }));
 host.send('create_room',{gameId:'ne-tem-golosom'});
 const room=await host.next('room_joined');
 assert.equal(room.version,'v3','new rooms must use hardened server snapshot');
 const roomId=room.roomId;
 guest.send('join_room',{roomId:roomId.slice(0,8).toUpperCase()});
 const joined=await guest.next('room_joined');
 assert.equal(joined.state.players.length,2);
 const scene={id:'qa-movie',title:'Test Clip',start:0,duration:14,roles:['Актёр','Режиссёр'],custom:true};
 host.send('game_message',{payload:{type:'scene',scene}});
 const selected=await guest.next('game_event',event('lobby',s=>s.scene.id===scene.id));
 const epoch=selected.event.payload.mediaEpoch;
 assert(epoch>=2);
 assert.equal(selected.event.payload.mediaReady[guest.id],false);
 host.send('game_message',{payload:{type:'start'}});
 const denied=await host.next('game_event',p=>p.event?.type==='notice');
 assert.match(String(denied.event.payload),/видео/i);
 guest.send('game_message',{payload:{type:'media_ready',scene:scene.id,epoch:epoch-1}});
 guest.send('game_message',{payload:{type:'sync'}});
 const stale=await guest.next('game_event',event('lobby',s=>s.scene.id===scene.id));
 assert.equal(stale.event.payload.mediaReady[guest.id],false);
 guest.send('game_message',{payload:{type:'media_ready',scene:scene.id,epoch}});
 await guest.next('game_event',event('lobby',s=>s.mediaReady[guest.id]===true));
 host.send('game_message',{payload:{type:'start'}});
 const started=await host.next('game_event',event('recording'));
 assert.equal(started.event.payload.phase,'recording');
 guest.send('game_message',{payload:{type:'ready',count:0}});
 assert.match(String((await guest.next('game_event',p=>p.event?.type==='notice')).event.payload),/фрагментов/i);
 host.send('game_message',{payload:{type:'ready',count:1}});
 guest.send('game_message',{payload:{type:'ready',count:1}});
 await host.next('game_event',event('recording',s=>s.ready[host.id]&&s.ready[guest.id]));
 host.send('game_message',{payload:{type:'reveal'}});
 await guest.next('game_event',event('premiere'));
 const meta={id:'guest-voice-1',owner:guest.id,start:1,end:2,offset:0,epoch};
 guest.send('game_message',{payload:{type:'relay',to:host.id,data:{action:'begin',token:'qa-token-one',kind:'audio',size:1000,meta}}});
 const relay=await host.next('game_event',p=>p.event?.type==='relay');
 assert.equal(relay.event.payload.from,guest.id);
 assert.equal(relay.event.payload.data.meta.epoch,epoch);
 host.send('game_message',{payload:{type:'again'}});
 await guest.next('game_event',event('lobby',s=>s.mediaEpoch===epoch));
 host.send('game_message',{payload:{type:'scene',scene}});
 const next=await guest.next('game_event',event('lobby',s=>s.mediaEpoch===epoch+1));
 assert.equal(next.event.payload.mediaReady[guest.id],false);
 guest.send('game_message',{payload:{type:'media_ready',scene:scene.id,epoch}});
 guest.send('game_message',{payload:{type:'sync'}});
 assert.equal((await guest.next('game_event',event('lobby',s=>s.mediaEpoch===epoch+1))).event.payload.mediaReady[guest.id],false);
 console.log('PocketNet v3: authenticated join, scene receipts, ready, relay, repeat and epoch reset passed');
}finally{
 for(const c of clients)c.close();
}
