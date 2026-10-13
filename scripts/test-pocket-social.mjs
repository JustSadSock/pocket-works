import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {PocketSocial} from '../pocket-social/hub.mjs';
import {mascotSvg,safeMascot} from '../shared/capabilities/maskot.js';

for(const animal of ['cat','rabbit','frog']){
  for(const outfit of ['tunic','vest','mantle']){
    const art=mascotSvg({animal,hat:'crown',clothes:outfit,face:'glasses'});
    assert.match(art,/<svg /);assert.match(art,/<path /);
    assert.doesNotMatch(art,/<script|foreignObject|onload=/i);
  }
}
assert.equal(safeMascot({animal:'cat',hat:'helmet',clothes:'spacesuit',face:'none'}).hat,'none');
assert.equal(safeMascot({animal:'cat',hat:'veil',clothes:'wedding',face:'none'},['wedding']).hat,'veil');
const rootHtml=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const rootSw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const rootVersion=rootHtml.match(/<meta name="pocket-works-build" content="([^"]+)"/)?.[1];
assert.ok(rootVersion,'launcher must declare build version');
assert.ok(rootHtml.includes('shared/pocket-social.js?v='+rootVersion),'social script must use current launcher version');
assert.ok(rootSw.includes("const APP_VERSION = '"+rootVersion+"'"),'service worker must match launcher version');
assert.ok(rootSw.includes("'./shared/capabilities/maskot.js'"),
  'offline shell must precache the mascot asset imported by identity and social modules');
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
// MASKOT cosmetics are account-bound and server-validated.
const plainMaskot={animal:'frog',hat:'flower',clothes:'mantle',face:'glasses'};
const aliceCard={background:'forest',frame:'clean',artwork:'',favoriteGame:'',
  discoverable:true,presenceVisible:true,allowInvites:true};
assert.equal((await call(0,'profile',{...aliceCard,maskot:plainMaskot,title:'Первопроходец'})).ok,true);
assert.deepEqual((await call(0,'me')).profile.maskot,plainMaskot);
assert.equal((await call(0,'me')).profile.title,'Первопроходец');
assert.equal((await call(1,'user?id='+users[0].id)).profile.maskot.animal,'frog');
assert.equal((await call(1,'user?id='+users[0].id)).profile.unlocked,undefined);
assert.equal((await call(0,'profile',{...aliceCard,maskot:{...plainMaskot,hat:'helmet'},title:''})).httpStatus,400);
assert.equal((await call(0,'redeem',{code:'ORBIT-BAD'})).httpStatus,400);
assert.equal((await call(0,'redeem',{code:'ORBIT-7'})).reward,'astronaut');
assert.equal((await call(0,'redeem',{code:'ORBIT-7'})).already,true);
assert.equal((await call(0,'profile',{...aliceCard,maskot:{...plainMaskot,hat:'helmet',clothes:'spacesuit'},title:''})).ok,true);
assert.equal((await call(1,'profile',{...aliceCard,maskot:{...plainMaskot,hat:'veil'}})).httpStatus,400);
assert.equal((await call(1,'redeem',{code:'WHITE-ROSE'})).reward,'wedding');
assert.equal((await call(1,'profile',{...aliceCard,maskot:{...plainMaskot,hat:'veil',clothes:'wedding'}})).ok,true);
assert.equal((await call(1,'me')).profile.unlocked.includes('wedding'),true);
assert.equal((await call(0,'profile',{...aliceCard})).ok,true,'old clients preserve cosmetics');
assert.equal((await call(0,'me')).profile.maskot.hat,'helmet','legacy update keeps new layers');
assert.equal((await call(0,'me')).profile.backgroundMode,'preset');
assert.equal((await call(0,'me')).profile.portraitFrame,'wood');

const beforeMedieval={...plainMaskot,hat:'bascinet'};
assert.equal((await call(0,'profile',{...aliceCard,maskot:beforeMedieval})).httpStatus,400,'locked bascinet denied');
assert.equal((await call(0,'profile',{...aliceCard,maskot:{...plainMaskot,clothes:'tabard'}})).httpStatus,400,'locked herald tabard denied');
assert.equal((await call(0,'redeem',{code:'VIGIL-BAD'})).httpStatus,400);
assert.equal((await call(0,'redeem',{code:'VIGIL-1347'})).reward,'knight');
assert.equal((await call(0,'redeem',{code:'VIGIL-1347'})).already,true);
assert.equal((await call(0,'profile',{...aliceCard,maskot:beforeMedieval})).ok,true);
assert.equal((await call(0,'profile',{...aliceCard,maskot:{...plainMaskot,clothes:'tabard'}})).httpStatus,400);
assert.equal((await call(0,'redeem',{code:'HERALD-1415'})).reward,'herald');
assert.equal((await call(0,'profile',{...aliceCard,maskot:{...plainMaskot,hat:'bascinet',clothes:'tabard'}})).ok,true);
assert.equal((await call(0,'me')).profile.unlocked.includes('herald'),true);
assert.equal((await call(1,'profile',{...aliceCard,maskot:{...plainMaskot,hat:'bascinet'}})).httpStatus,400);
assert.equal(safeMascot({animal:'cat',hat:'bascinet',clothes:'tabard',face:'none'},['knight']).clothes,'tunic');
assert.equal(safeMascot({animal:'cat',hat:'bascinet',clothes:'tabard',face:'none'},['knight','herald']).hat,'bascinet');
for(const animal of ['cat','rabbit','frog']){
  for(const kind of [{hat:'bascinet',clothes:'tunic',unlocks:['knight']},{hat:'none',clothes:'tabard',unlocks:['herald']}]){
    const svg=mascotSvg({animal,hat:kind.hat,clothes:kind.clothes,face:'none'},{unlocks:kind.unlocks});
    assert.match(svg,/stroke=/);assert.doesNotMatch(svg,/undefined|<script|foreignObject/i);
  }
}

const paint='data:image/webp;base64,AAAA';
assert.equal((await call(0,'profile',{...aliceCard,artwork:paint,backgroundMode:'drawing',portraitFrame:'gilt'})).ok,true);
let drawn=(await call(0,'me')).profile;
assert.equal(drawn.artwork,paint);
assert.equal(drawn.backgroundMode,'drawing');
assert.equal(drawn.portraitFrame,'gilt');
assert.equal((await call(0,'profile',{...aliceCard,artwork:paint,backgroundMode:'preset',portraitFrame:'wood'})).ok,true);
drawn=(await call(0,'me')).profile;
assert.equal(drawn.artwork,paint,'switching to preset retains drawing for later reuse');
assert.equal(drawn.backgroundMode,'preset','preset and drawing are exclusive');
assert.equal((await call(0,'profile',{...aliceCard,backgroundMode:'mixed'})).httpStatus,400);
assert.equal((await call(0,'profile',{...aliceCard,portraitFrame:'arbitrary'})).httpStatus,400);
assert.equal((await call(0,'profile',{...aliceCard})).ok,true,'legacy profile updates keep mode/frame');
drawn=(await call(0,'me')).profile;
assert.equal(drawn.backgroundMode,'preset');
assert.equal(drawn.portraitFrame,'wood');
assert.equal((await call(1,'user?id='+users[0].id)).profile.portraitFrame,'wood');
// Only internal PocketNet messages may mint achievements. Browser calls fail.
assert.equal((await call(0,'award',{accountId:users[0].id,achievementId:'zamazka.first-stroke'})).httpStatus,403);
const grant=async achievementId=>{
 const req=new Request('https://example.com/pocket-social/award',{method:'POST',
   headers:{'content-type':'application/json','x-pw-internal':'1'},
   body:JSON.stringify({accountId:users[0].id,nickname:'Alice',avatar:'clay',
     achievementId,gameId:'zamazka',roomId:room,matchId:room})});
 const res=await hub.fetch(req),data=await res.json();calls++;return {status:res.status,...data};
};
assert.equal((await call(0,'profile',{...aliceCard,maskot:{...plainMaskot,face:'monocle'}})).httpStatus,400);
assert.equal((await call(0,'profile',{...aliceCard,maskot:{...plainMaskot,hat:'brush'}})).httpStatus,400);
assert.equal((await call(0,'profile',{...aliceCard,maskot:{...plainMaskot,clothes:'restorer'}})).httpStatus,400);
assert.equal((await call(0,'profile',{...aliceCard,background:'gallery'})).httpStatus,400);
assert.equal((await call(0,'profile',{...aliceCard,portraitFrame:'worn-gilt'})).httpStatus,400);
assert.equal((await call(0,'profile',{...aliceCard,title:'Подмастерье'})).httpStatus,400);
const ids=['first-stroke','sharp-eye','shared-canvas','three-rounds','five-works','perfect-forgery','maestro'];
for(const id of ids)assert.equal((await grant('zamazka.'+id)).ok,true);
assert.equal((await grant('zamazka.first-stroke')).already,true,'repeated award delivery idempotent');
assert.equal((await call(0,'achievements')).achievements.length,7);
assert.equal((await call(1,'achievements')).achievements.length,0);
assert.equal((await call(1,'user?id='+users[0].id)).profile.unlocked,undefined,'privacy: no inventory in public profiles');
assert.equal((await call(0,'profile',{...aliceCard,maskot:{...plainMaskot,hat:'brush',face:'monocle',clothes:'restorer'},
  title:'Подмастерье',backgroundMode:'preset',portraitFrame:'worn-gilt'})).ok,true);
assert.equal((await call(0,'profile',{...aliceCard,background:'gallery',maskot:{...plainMaskot,hat:'brush',face:'monocle',clothes:'restorer'},
  title:'Знаток подделок',backgroundMode:'preset',portraitFrame:'worn-gilt'})).ok,true);
assert.equal((await call(0,'me')).profile.background,'gallery');
assert.equal((await call(1,'profile',{...aliceCard,background:'gallery'})).httpStatus,400);
assert.equal((await call(0,'me')).profile.achievements.length,7);
console.log('Pocket Social: '+calls+' SQLite API assertions passed.');
