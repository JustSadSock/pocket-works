import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {PocketSocial} from '../pocket-social/hub.mjs';

const db=new DatabaseSync(':memory:');
const sql={exec(query,...args){
  const stmt=db.prepare(query);
  const isRead=/^\s*(SELECT|PRAGMA)/i.test(query);
  if(!isRead)stmt.run(...args);
  return {toArray:()=>isRead?stmt.all(...args):[]};
}};
const hub=new PocketSocial({storage:{sql}});
const users=[
  {id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',nickname:'Alice',avatar:'clay'},
  {id:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',nickname:'Bob',avatar:'moss'},
  {id:'cccccccc-cccc-4ccc-cccc-cccccccccccc',nickname:'Cora',avatar:'stone'}
];
const room='dddddddd-dddd-4ddd-dddd-dddddddddddd';
let calls=0;
async function call(who,path,body=null,extra={}){
  const user=users[who],headers={
    'x-pw-account-id':user.id,'x-pw-account-name':user.nickname,'x-pw-account-avatar':user.avatar,
    ...(body?{'origin':'https://example.com','content-type':'application/json'}:{}),...extra
  };
  const request=new Request('https://example.com/pocket-social/'+path,{method:body?'POST':'GET',headers,
    ...(body?{body:JSON.stringify(body)}:{})});
  const result=await hub.fetch(request),data=await result.json();calls++;
  return {httpStatus:result.status,...data};
}
let a=await call(0,'me'),b=await call(1,'me');
assert.equal(a.profile.nickname,'Alice');
assert.equal(b.profile.nickname,'Bob');
assert.equal(a.friends.length,0);
const search=await call(0,'search?q=Bo',null,{'x-pw-directory':JSON.stringify([users[1]])});
assert.equal(search.users[0].nickname,'Bob');
assert.equal((await call(0,'friend-request',{id:users[1].id})).httpStatus,201);
assert.equal((await call(1,'me')).incoming.length,1);
assert.equal((await call(1,'friend-action',{id:users[0].id,action:'accept'})).ok,true);
assert.equal((await call(0,'friends')).friends.length,1);
assert.equal((await call(0,'invite',{toId:users[1].id,gameId:'zamazka',roomId:room})).httpStatus,400);
const invite=await call(0,'invite',{toId:users[1].id,gameId:'zamazka',roomId:room},{'x-pw-validated-room':room});
assert.equal(invite.ok,true);
const pending=(await call(1,'friends')).invites.find(x=>x.id===invite.inviteId);
assert.equal(pending?.status,'pending');
const inspect=await call(1,'inspect-invite?id='+invite.inviteId);
assert.equal(inspect.invite.roomId,room);
assert.equal((await call(1,'invite-action',{id:invite.inviteId,action:'accept'})).httpStatus,409);
const accepted=await call(1,'invite-action',{id:invite.inviteId,action:'accept'},{'x-pw-validated-invite':invite.inviteId});
assert.equal(accepted.ok,true);
const blindInvite=await call(0,'invite',{toId:users[1].id,gameId:'blind-pals',roomId:room},{'x-pw-validated-room':room});
assert.equal(blindInvite.ok,true,'blind-pals supports real friend invitations');
const blindAccepted=await call(1,'invite-action',{id:blindInvite.inviteId,action:'accept'},{'x-pw-validated-invite':blindInvite.inviteId});
assert.equal(blindAccepted.url,'/apps/blind-pals/?room='+encodeURIComponent(room));
assert.match(accepted.url,/^\/apps\/zamazka\/\?room=/);
assert.equal((await call(1,'profile',{background:'paper',frame:'double',artwork:'',
  favoriteGame:'zamazka',discoverable:false,presenceVisible:false,allowInvites:false})).ok,true);
assert.equal((await call(0,'search?q=Bo',null,{'x-pw-directory':JSON.stringify([users[1]])})).users.length,0);
assert.equal((await call(1,'presence',{gameId:'zamazka'})).ok,true);
assert.equal((await call(0,'user?id='+users[1].id)).profile.online,false);
assert.equal((await call(0,'invite',{toId:users[1].id,gameId:'zamazka',roomId:room},{'x-pw-validated-room':room})).httpStatus,403);
assert.equal((await call(0,'friend-action',{id:users[1].id,action:'block'})).ok,true);
assert.equal((await call(1,'friends')).friends.length,0);
assert.equal((await call(0,'friend-action',{id:users[1].id,action:'unblock'})).ok,true);
assert.equal((await call(1,'friend-request',{id:users[0].id})).httpStatus,201);
assert.equal((await call(0,'friend-action',{id:users[1].id,action:'decline'})).ok,true);
assert.equal((await call(0,'friends')).friends.length,0);
console.log('Pocket Social: '+calls+' SQLite API assertions passed.');
