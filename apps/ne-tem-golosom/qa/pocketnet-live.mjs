// Two authenticated actors against a real local PocketNet Durable Object.
// Verifies room lifecycle and that prior footage/voice epochs cannot unlock
// the next selected scene.
import assert from 'node:assert/strict';
import WebSocket from '../../../pocket-server/node_modules/ws/index.js';

const base=process.env.POCKETNET_TEST_URL||'http://127.0.0.1:8787';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const event=(phase,check=()=>true)=>p=>p.event?.type==='state'&&p.event.payload?.phase===phase&&check(p.event.payload);
const sendGame=async(client,payload)=>{client.send('game_message',{payload});await delay(200)};
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
    const callsite=new Error().stack?.split('\n').slice(2,4).join(' / ')||'?';
    const w={type,match,resolve,reject};
    w.timer=setTimeout(()=>{
     const i=waiters.indexOf(w);if(i!==-1)waiters.splice(i,1);
     reject(Error('Missing '+type+' at '+callsite+': '+JSON.stringify(messages.slice(-5)).slice(0,1800)));
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
 const tokens=await Promise.all(['NTG Host','NTG Guest'].map(getToken));
 let [host,guest]=await Promise.all(tokens.map(async token=>{
  const c=await actor(token);clients.push(c);return c;
 }));
 host.send('create_room',{gameId:'ne-tem-golosom'});
 const room=await host.next('room_joined');
 assert.equal(room.version,'v4','new rooms must use hardened server snapshot');
 const roomId=room.roomId;
 guest.send('join_room',{roomId:roomId.slice(0,8).toUpperCase()});
 const joined=await guest.next('room_joined');
 assert.equal(joined.state.players.length,2);
 const scene={id:'qa-movie',title:'Test Clip',start:0,duration:14,roles:['Актёр','Режиссёр'],custom:true};
 await sendGame(host,{type:'scene',scene});
 const selected=await guest.next('game_event',event('lobby',s=>s.scene.id===scene.id));
 const epoch=selected.event.payload.mediaEpoch;
 assert(epoch>=2);
 assert.equal(selected.event.payload.mediaReady[guest.id],false);
 await sendGame(host,{type:'start'});
 const denied=await host.next('game_event',p=>p.event?.type==='notice');
 assert.match(String(denied.event.payload),/видео/i);
 await sendGame(guest,{type:'media_ready',scene:scene.id,epoch:epoch-1});
 await sendGame(guest,{type:'sync'});
 const stale=await guest.next('game_event',event('lobby',s=>s.scene.id===scene.id));
 assert.equal(stale.event.payload.mediaReady[guest.id],false);
 await sendGame(guest,{type:'media_ready',scene:scene.id,epoch});
 await guest.next('game_event',event('lobby',s=>s.mediaReady[guest.id]===true));
 // A dropped guest keeps their seat and acknowledged video, rather than
 // triggering onLeave/onJoin which would reset the current scene.
 const guestId=guest.id,guestOffline=host.next('presence',p=>
  p.disconnected===guestId&&Array.isArray(p.onlineIds)&&!p.onlineIds.includes(guestId));
 guest.close();
 await guestOffline;
 guest=await actor(tokens[1]);clients.push(guest);
 assert.equal(guest.id,guestId);
 guest.send('join_room',{roomId});
 const resumedLobby=await guest.next('room_joined');
 assert.equal(resumedLobby.state.scene.id,scene.id);
 assert.equal(resumedLobby.state.mediaEpoch,epoch);
 assert.equal(resumedLobby.state.mediaReady[guestId],true);
 assert.equal(resumedLobby.state.players.length,2);
 assert(resumedLobby.onlineIds.includes(guestId));
 await sendGame(host,{type:'start'});
 const started=await host.next('game_event',event('recording'));
 assert.equal(started.event.payload.phase,'recording');
 await sendGame(guest,{type:'ready',count:0});
 assert.match(String((await guest.next('game_event',p=>p.event?.type==='notice')).event.payload),/фрагментов/i);
 await sendGame(host,{type:'ready',count:1});
 await sendGame(guest,{type:'ready',count:1});
 await host.next('game_event',event('recording',s=>s.ready[host.id]&&s.ready[guest.id]));
 // Even after both voice actors have finished, reconnecting the host must
 // not reset readiness, promote a new host or create a replacement room.
 const hostId=host.id,hostOffline=guest.next('presence',p=>
  p.disconnected===hostId&&Array.isArray(p.onlineIds)&&!p.onlineIds.includes(hostId));
 host.close();
 await hostOffline;
 host=await actor(tokens[0]);clients.push(host);
 assert.equal(host.id,hostId);
 host.send('join_room',{roomId});
 const resumedRecording=await host.next('room_joined');
 assert.equal(resumedRecording.state.phase,'recording');
 assert.equal(resumedRecording.state.mediaEpoch,epoch);
 assert.equal(resumedRecording.state.host,hostId);
 assert.equal(resumedRecording.state.ready[hostId],true);
 assert.equal(resumedRecording.state.ready[guestId],true);
 await sendGame(host,{type:'reveal'});
 await guest.next('game_event',event('premiere'));
 const meta={id:'guest-voice-1',owner:guest.id,start:1,end:2,offset:0,epoch};
 await sendGame(guest,{type:'relay',to:host.id,data:{action:'begin',token:'qa-token-one',kind:'audio',size:1000,meta}});
 const relay=await host.next('game_event',p=>p.event?.type==='relay');
 assert.equal(relay.event.payload.from,guest.id);
 assert.equal(relay.event.payload.data.meta.epoch,epoch);
 await sendGame(host,{type:'again'});
 await guest.next('game_event',event('lobby',s=>s.mediaEpoch===epoch));
 await sendGame(host,{type:'scene',scene});
 const next=await guest.next('game_event',event('lobby',s=>s.mediaEpoch===epoch+1));
 assert.equal(next.event.payload.mediaReady[guest.id],false);
 await sendGame(guest,{type:'media_ready',scene:scene.id,epoch});
 await sendGame(guest,{type:'sync'});
 assert.equal((await guest.next('game_event',event('lobby',s=>s.mediaEpoch===epoch+1))).event.payload.mediaReady[guest.id],false);
 console.log('PocketNet v3: authenticated join, seat recovery, offline presence, scene receipts, ready, relay, repeat and epoch reset passed');
}finally{
 for(const c of clients)c.close();
}
