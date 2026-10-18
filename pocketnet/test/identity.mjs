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
 // Two real Pocket IDs: search, friend approval, validated live invite and join link.
 const callSocial=async(cookie,path,body=null)=>{
   const result=await fetch(base+'/pocket-social/'+path,{
     method:body?'POST':'GET',
     headers:{origin:base,cookie,...(body?{'content-type':'application/json'}:{})},
     ...(body?{body:JSON.stringify(body)}:{})
   });
   return {status:result.status,data:await result.json()};
 };
 const bobID=(await (await fetch(base+'/pocket-id/me',{headers:{cookie:bob.cookie}})).json()).user.id;
 const socialAlice=await callSocial(alice.cookie,'me');
 assert.equal(socialAlice.status,200);
 // A guest in the same room can inspect public player identities without logging in.
 // It must not gain access to the social graph, profile edits or internal lookups.
 const publicHost=await callSocial('', 'user?id='+auth.player.accountId);
 assert.equal(publicHost.status,200,'guest player portrait lookup must be public');
 assert.equal(publicHost.data.profile.id,auth.player.accountId);
 assert.equal(publicHost.data.profile.nickname,nick1);
 assert.equal(publicHost.data.profile.avatar,'plum');
 assert.deepEqual(Object.keys(publicHost.data.profile).sort(),
  ['artwork','avatar','id','maskot','nickname','title'].sort(),'guest card contains public fields only');
 assert.equal((await callSocial('', 'friends')).status,401,'guest cannot read friend graph');
 assert.equal((await callSocial('', 'me')).status,401,'guest cannot read private social snapshot');
 assert.equal((await callSocial('', 'friend-request',{id:auth.player.accountId})).status,401,'guest cannot mutate social state');
 const forgedPublic=await fetch(base+'/pocket-id/public?id='+encodeURIComponent(auth.player.accountId),{
  headers:{'x-pw-social-internal':'1','x-pw-public-portrait':'1'}
 });
 assert.equal(forgedPublic.status,404,'direct client headers cannot bypass private Pocket ID routing');
 const findBob=await callSocial(alice.cookie,'search?q='+encodeURIComponent(nick2.slice(0,7)));
 assert.equal(findBob.status,200,JSON.stringify(findBob.data));
 assert.ok(findBob.data.users.some(p=>p.id===bobID),'Verified Pocket ID directory should find Bob');
 const friendAsk=await callSocial(alice.cookie,'friend-request',{id:bobID});
 assert.equal(friendAsk.status,201,JSON.stringify(friendAsk.data));
 const friendAccept=await callSocial(bob.cookie,'friend-action',{id:auth.player.accountId,action:'accept'});
 assert.equal(friendAccept.status,200,JSON.stringify(friendAccept.data));
 assert.equal((await callSocial(alice.cookie,'friends')).data.friends.length,1);
 const bobVisible=(await callSocial(bob.cookie,'me')).data.friends.find(p=>p.id===auth.player.accountId);
 assert.equal(bobVisible?.activity?.gameId,'zamazka','friends see a real active PocketNet room');
 assert.equal(bobVisible?.activity?.joinable,true,'only a lobby with space can be joined');
 const oneTap=await callSocial(bob.cookie,'join-friend',{id:auth.player.accountId});
 assert.equal(oneTap.status,200,JSON.stringify(oneTap.data));
 assert.equal(oneTap.data.url,'/apps/zamazka/?room='+room.roomId);
 const leaked=await fetch(base+'/pocketnet/social-rooms',{
   method:'POST',headers:{origin:base,'x-pw-internal':'1','content-type':'application/json'},
   body:JSON.stringify({accountIds:[auth.player.accountId]})
 });
 assert.equal(leaked.status,403,'the public edge strips privileged room lookup headers');
 const badInvite=await callSocial(bob.cookie,'invite',{toId:auth.player.accountId,gameId:'zamazka',roomId:room.roomId});
 assert.equal(badInvite.status,403,'Cannot invite from a room you are not in');
 const invitation=await callSocial(alice.cookie,'invite',{toId:bobID,gameId:'zamazka',roomId:room.roomId});
 assert.equal(invitation.status,201,JSON.stringify(invitation.data));
 const bobInbox=await callSocial(bob.cookie,'friends');
 assert.ok(bobInbox.data.invites.some(i=>i.id===invitation.data.inviteId&&i.status==='pending'));
 const acceptInvitation=await callSocial(bob.cookie,'invite-action',{id:invitation.data.inviteId,action:'accept'});
 assert.equal(acceptInvitation.status,200,JSON.stringify(acceptInvitation.data));
 assert.equal(acceptInvitation.data.url,'/apps/zamazka/?room='+room.roomId);
 assert.equal((await callSocial(alice.cookie,'party',{action:'add',id:bobID})).data.party[0],bobID);
 const companyInvite=await callSocial(alice.cookie,'invite-party',{gameId:'zamazka',roomId:room.roomId});
 assert.equal(companyInvite.status,200,JSON.stringify(companyInvite.data));
 assert.equal(companyInvite.data.sent,1,'verified host can invite saved company');
 assert.equal((await callSocial(alice.cookie,'me')).data.party[0],bobID);

 assert.equal(room.players[0].name,nick1);
 assert.equal(room.players[0].verified,true);
 assert.equal(room.players[0].avatar,'plum');
 guest.send('join_room',{roomId:room.roomId});
 const joined=await guest.next('room_joined');
 assert.equal(joined.state.participants[0].name,nick1);
 assert.equal(joined.state.participants[0].verified,true);
 assert.equal(joined.state.participants[1].verified,false);
 // A second tab with the same Pocket ID cannot occupy another player seat.
 const duplicateToken=await token('Impersonated name',alice.cookie);
 const duplicate=await open(duplicateToken,alice.cookie);
 await duplicate.next('authenticated');
 duplicate.send('join_room',{roomId:room.roomId});
 assert.equal((await duplicate.next('error')).code,'account_already_in_room');
 await close(duplicate);
 // The room seat must survive a verified profile edit and WebSocket reconnection.
 const revisedName=nick1+'X';
 const updated=await fetch(base+'/pocket-id/profile',{method:'POST',headers:{
  origin:base,'content-type':'application/json',cookie:alice.cookie
 },body:JSON.stringify({nickname:revisedName,avatar:'stone'})});
 assert.equal(updated.status,200,await updated.text());
 await close(verified);
 verified=await open(aliceToken,alice.cookie);
 const refreshed=await verified.next('authenticated');
 assert.equal(refreshed.player.id,auth.player.id);
 assert.equal(refreshed.player.name,revisedName);
 assert.equal(refreshed.player.avatar,'stone');
 verified.send('join_room',{roomId:room.roomId});
 const rejoined=await verified.next('room_joined');
 assert.equal(rejoined.state.participants[0].id,auth.player.id);
 assert.equal(rejoined.state.participants[0].name,revisedName);
 assert.equal(rejoined.state.participants[0].avatar,'stone');
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
