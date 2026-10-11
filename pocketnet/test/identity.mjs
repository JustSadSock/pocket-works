import assert from 'node:assert/strict';
import WebSocket from '../../pocket-server/node_modules/ws/index.js';
import { setTimeout as sleep } from 'node:timers/promises';

const base=process.env.POCKETNET_TEST_URL||'http://127.0.0.1:8787';
let users=0;
async function register(suffix,avatar){
 const res=await fetch(base+'/pocket-id/register',{method:'POST',headers:{origin:base,'content-type':'application/json'},
  body:JSON.stringify({nickname:suffix,avatar})});
 assert.equal(res.status,201,await res.text().catch(()=>'')); // on failure include server response
 const cookie=res.headers.get('set-cookie')?.split(';')[0];
 assert.match(cookie||'',/^__Host-pw-id=/);
 return {cookie};
}
async function token(name,cookie,extra={}){
 const res=await fetch(base+'/pocketnet/session',{method:'POST',headers:{origin:base,'content-type':'application/json',...(cookie?{cookie}:{}),...extra},
  body:JSON.stringify({name})});
 if(res.status!==200)throw Error('session: '+res.status+' '+await res.text());
 return (await res.json()).token;
}
async function open(token,cookie){
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/pocketnet/ws',{origin:base,headers:cookie?{cookie}:{}});
 const inbox=[],waiting=[];
 ws.on('message',raw=>{
  const obj=JSON.parse(String(raw));
  const waiter=waiting.find(w=>w.type===obj.type);
  if(waiter){waiting.splice(waiting.indexOf(waiter),1);waiter.resolve(obj)}else inbox.push(obj);
 });
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
 const channel={
  ws,send:(type,rest={})=>ws.send(JSON.stringify({wireVersion:1,type,...rest})),
  async next(type){
   const i=inbox.findIndex(m=>m.type===type);
   if(i>=0)return inbox.splice(i,1)[0];
   return Promise.race([
    new Promise(resolve=>waiting.push({type,resolve})),
    sleep(7000,undefined,{ref:false}).then(()=>{throw Error('Timed out waiting for '+type+'; '+JSON.stringify(inbox))})
   ]);
  }
 };
 channel.send('auth',{token});
 return channel;
}
async function close(c){
 if(!c||c.ws.readyState===WebSocket.CLOSED)return;
 c.ws.close();
 await Promise.race([new Promise(resolve=>c.ws.once('close',resolve)),sleep(1000).then(()=>c.ws.terminate())]);
}
let verified=null,guest=null,stolen=null,wrong=null;
const unique=Date.now().toString(36);
const nick1='IDAlpha'+unique;
const nick2='IDBeta'+unique;
try{
 const alice=await register(nick1,'plum');
 const bob=await register(nick2,'moss');
 const [aliceToken,guestToken]=await Promise.all([
  token('An Arbitrary Forged Name',alice.cookie),
  token(nick1,null,{'x-pw-account-id':'ffffffff-ffff-ffff-ffff-ffffffffffff',
   'x-pw-account-name':nick1,'x-pw-account-avatar':'plum'})
 ]);
 // A session token is useless when accompanied by no identity or a different user.
 stolen=await open(aliceToken,null);
 assert.equal((await stolen.next('error')).code,'invalid_token');
 wrong=await open(aliceToken,bob.cookie);
 assert.equal((await wrong.next('error')).code,'invalid_token');
 verified=await open(aliceToken,alice.cookie);
 const auth=await verified.next('authenticated');
 assert.equal(auth.player.name,nick1);
 assert.equal(auth.player.avatar,'plum');
 assert.equal(auth.player.verified,true);
 assert.ok(auth.player.accountId);
 guest=await open(guestToken,null);
 const guestAuth=await guest.next('authenticated');
 assert.equal(guestAuth.player.name,'Гость · '+nick1);
 assert.equal(guestAuth.player.verified,false);
 assert.equal(guestAuth.player.accountId,null);
 verified.send('create_room',{gameId:'zamazka'});
 const room=await verified.next('room_joined');
 assert.equal(room.players[0].name,nick1);
 assert.equal(room.players[0].verified,true);
 assert.equal(room.players[0].avatar,'plum');
 guest.send('join_room',{roomId:room.roomId});
 const joined=await guest.next('room_joined');
 assert.equal(joined.state.participants[0].name,nick1);
 assert.equal(joined.state.participants[0].verified,true);
 assert.equal(joined.state.participants[1].verified,false);
 // Leave both seats before revoking the host cookie, so room cleanup is deterministic.
 verified.send('leave_room');
 guest.send('leave_room');
 for(let attempt=0;attempt<40;attempt++){
  const health=await (await fetch(base+'/pocketnet/health')).json();
  if(health.rooms===0)break;
  await sleep(50);
  if(attempt===39)throw Error('Identity room was not cleaned up');
 }
 // Logging out invalidates cookies for any new connection to the trusted identity.
 const logout=await fetch(base+'/pocket-id/logout',{method:'POST',headers:{
  origin:base,'content-type':'application/json',cookie:alice.cookie
 },body:'{}'});
 assert.equal(logout.status,200);
 await close(verified);verified=null;
 const revoked=await open(aliceToken,alice.cookie);
 assert.equal((await revoked.next('error')).code,'invalid_token');
 await close(revoked);
 console.log('PASS: Pocket ID verified room identity, server-enforced nicknames, guest markings, spoofed headers, stolen tokens and logout');
}finally{
 await Promise.all([close(verified),close(guest),close(stolen),close(wrong)]);
}
