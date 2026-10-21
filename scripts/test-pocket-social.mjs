import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {PocketSocial} from '../pocket-social/hub.mjs';
import {mascotSvg,safeMascot,mascotPublicUnlocks} from '../shared/capabilities/maskot.js';

for(const animal of ['cat','black-cat','fox','rabbit','frog']){
  for(const outfit of ['tunic','vest','mantle']){
    const art=mascotSvg({animal,hat:'crown',clothes:outfit,face:'glasses'});
    assert.match(art,/<svg /);assert.match(art,/<path /);
    assert.doesNotMatch(art,/<script|foreignObject|onload=/i);
  }
}
assert.equal(safeMascot({animal:'cat',hat:'helmet',clothes:'spacesuit',face:'none'}).hat,'none');
assert.equal(safeMascot({animal:'cat',hat:'veil',clothes:'wedding',face:'none'},['wedding']).hat,'veil');
assert.equal(safeMascot({animal:'fox',hat:'stage-pin',clothes:'stage-hanbok',face:'none',accessory:'shoulder-dragon'}).hat,'none');
assert.equal(safeMascot({animal:'fox',hat:'stage-pin',clothes:'stage-hanbok',face:'none',accessory:'shoulder-dragon'}).accessory,'none');
assert.equal(safeMascot({animal:'fox',hat:'none',clothes:'tunic',face:'none',accessory:'brush'},['zamazka.shared-canvas']).accessory,'none','earned hat cannot masquerade as shoulder accessory');
assert.deepEqual(safeMascot({animal:'black-cat'}),{animal:'black-cat',hat:'none',clothes:'tunic',face:'none',accessory:'none'});
assert.equal(safeMascot({animal:'fox',hat:'stage-pin',clothes:'stage-hanbok',face:'none',accessory:'shoulder-dragon'},
  ['seoul-artist','dragon-keeper']).accessory,'shoulder-dragon');
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
assert.equal((await call(0,'profile',{...aliceCard,maskot:{...plainMaskot,clothes:'groom'}})).httpStatus,400,'unearned wedding tuxedo denied');
assert.equal((await call(0,'redeem',{code:'GROOM-INVALID'})).httpStatus,400);
const weddingSuit=(await call(0,'redeem',{code:'groom-2026'}));
assert.equal(weddingSuit.reward,'groom');
assert.equal(weddingSuit.already,false);
assert.equal((await call(0,'redeem',{code:'GROOM-2026'})).already,true,'groom code is repeat-safe');
assert.equal((await call(0,'profile',{...aliceCard,maskot:{...plainMaskot,clothes:'groom'}})).ok,true);
assert.equal((await call(0,'me')).profile.maskot.clothes,'groom');
assert.equal((await call(1,'profile',{...aliceCard,maskot:{...plainMaskot,clothes:'groom'}})).httpStatus,400,'groom cosmetic cannot be used by another account');
assert.equal((await call(1,'user?id='+users[0].id)).profile.maskot.clothes,'groom','other users can see validated wedding tuxedo');
assert.ok(mascotPublicUnlocks.includes('groom'),'public portrait renderer must preserve verified groom garment');
// Gift codes are account-bound: locked gear is rejected even if a client forges IDs.
for(const animal of ['black-cat','fox']){
  assert.equal((await call(2,'profile',{...aliceCard,maskot:{...plainMaskot,animal}})).ok,true);
  assert.equal((await call(2,'me')).profile.maskot.animal,animal);
}
assert.equal((await call(2,'profile',{...aliceCard,maskot:{...plainMaskot,hat:'stage-pin'}})).httpStatus,400);
assert.equal((await call(2,'profile',{...aliceCard,maskot:{...plainMaskot,clothes:'stage-hanbok'}})).httpStatus,400);
assert.equal((await call(2,'profile',{...aliceCard,maskot:{...plainMaskot,accessory:'shoulder-dragon'}})).httpStatus,400);
assert.equal((await call(2,'redeem',{code:'SEOUL-INVALID'})).httpStatus,400);
assert.equal((await call(2,'redeem',{code:'seoul-moonlight'})).reward,'seoul-artist');
assert.equal((await call(2,'redeem',{code:'SEOUL-MOONLIGHT'})).already,true);
assert.equal((await call(2,'redeem',{code:'DRAGON-EMBER'})).reward,'dragon-keeper');
assert.equal((await call(2,'redeem',{code:'DRAGON-EMBER'})).already,true);
const stageDragon={animal:'black-cat',hat:'stage-pin',clothes:'stage-hanbok',face:'stars',accessory:'shoulder-dragon'};
assert.equal((await call(2,'profile',{...aliceCard,maskot:stageDragon})).ok,true);
assert.deepEqual((await call(2,'me')).profile.maskot,stageDragon);
assert.equal((await call(1,'user?id='+users[2].id)).profile.maskot.accessory,'shoulder-dragon');
assert.equal((await call(1,'user?id='+users[2].id)).profile.unlocked,undefined);
assert.equal((await call(1,'profile',{...aliceCard,maskot:{...plainMaskot,accessory:'shoulder-dragon'}})).httpStatus,400);
assert.equal((await call(2,'profile',{...aliceCard,maskot:{...plainMaskot,animal:'fox'}})).ok,true,
  'old clients can change animals without deleting equipped shoulder cosmetics');
assert.equal((await call(2,'me')).profile.maskot.accessory,'shoulder-dragon');
for(const animal of ['cat','black-cat','fox','rabbit','frog']){
  const rendered=mascotSvg({animal,hat:'stage-pin',clothes:'stage-hanbok',face:'stars',accessory:'shoulder-dragon'},
    {unlocks:['seoul-artist','dragon-keeper']});
  assert.match(rendered,/Seoul Moonstage/);
  assert.match(rendered,/Tiny shoulder dragon/);
  assert.doesNotMatch(rendered,/undefined|<script|foreignObject|onload=/i);
  assert.equal(safeMascot({animal,hat:'stage-pin',clothes:'stage-hanbok',face:'none',accessory:'shoulder-dragon'},[]).accessory,'none');
}
assert.ok(mascotPublicUnlocks.includes('seoul-artist'));
assert.ok(mascotPublicUnlocks.includes('dragon-keeper'));

for(const animal of ['cat','rabbit','frog']){
  const equipped={animal,hat:'bascinet',clothes:'tabard',face:'none'};
  const rendered=mascotSvg(equipped,{unlocks:['knight','herald']});
  assert.match(rendered,/full|Wide|skull|head|bascinet|helm|surcoat/i);
  assert.match(rendered,/M16 255/,'tabard has full-width lower robe, not tiny overlay');
  if(animal==='rabbit')assert.match(rendered,/Rabbit-fitted helm/,'rabbit ears stay visible');
  else if(animal==='frog')assert.match(rendered,/Frog-fitted tournament bascinet/,'frog protruding eyes stay visible');
  else assert.match(rendered,/Bascinet of the guard/,'compact forged bascinet on cat');
  assert.doesNotMatch(rendered,/undefined|<script|foreignObject|onload=/i);
  const tux=mascotSvg({animal,hat:'none',clothes:'groom',face:'none'},{unlocks:['groom']});
  assert.match(tux,/Formal groom/,'new authored tuxedo layer');
  assert.match(tux,/M14 255/,'full body wedding jacket, not undersized vest');
  assert.equal(safeMascot({animal,hat:'none',clothes:'groom',face:'none'},[]).clothes,'tunic','locked cosmetics fallback safely');
  assert.equal(safeMascot({animal,hat:'none',clothes:'groom',face:'none'},['groom']).clothes,'groom');
}

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
const wearingNew={...plainMaskot,hat:'seer-diadem',accessory:'spectral-quill'};
assert.equal(safeMascot(wearingNew,[]).hat,'none','unearned seer circlet remains locked');
assert.equal(safeMascot(wearingNew,[]).accessory,'none','unearned spectral quill remains locked');
assert.equal((await call(0,'profile',{...aliceCard,maskot:wearingNew})).httpStatus,400,'no preview spoofing before earning');
assert.equal((await call(0,'profile',{...aliceCard,title:'Всевидящий'})).httpStatus,400,'retired title also requires award');
assert.equal((await grant('zamazka.ghost-brush')).ok,true);
assert.equal((await grant('zamazka.eagle-eye')).ok,true);
assert.equal(safeMascot(wearingNew,['zamazka.ghost-brush','zamazka.eagle-eye']).hat,'seer-diadem');
assert.equal(safeMascot(wearingNew,['zamazka.ghost-brush','zamazka.eagle-eye']).accessory,'spectral-quill');
assert.equal((await call(0,'profile',{...aliceCard,maskot:wearingNew,title:'Всевидящий'})).ok,true,
 'existing owners may keep retired earned titles with the new wearables');
assert.equal((await call(1,'profile',{...aliceCard,maskot:wearingNew})).httpStatus,400,'new cosmetics cannot be equipped by strangers');
assert.match(mascotSvg(wearingNew,{unlocks:['zamazka.ghost-brush','zamazka.eagle-eye']}),/Diadem of insight/);
assert.match(mascotSvg(wearingNew,{unlocks:['zamazka.ghost-brush','zamazka.eagle-eye']}),/Spectral feather/);

// Fast sync returns only a revision and changes when relationships or cosmetics change.
const revisionBefore=await call(0,'sync');
assert.match(revisionBefore.revision,/^[0-9a-z]+:\d+$/);
assert.equal(Object.hasOwn(revisionBefore,'friends'),false,'sync must not transmit full player cards');
assert.equal((await call(0,'sync')).revision,revisionBefore.revision,'stable state keeps the same revision');
assert.equal((await call(0,'me')).profile.owned,true,'own card gets the correct identity label');
assert.equal((await call(1,'me')).profile.owned,true);
await call(2,'me');
assert.equal((await call(2,'friend-request',{id:users[0].id})).httpStatus,201);
assert.notEqual((await call(0,'sync')).revision,revisionBefore.revision,'new friend request invalidates revision');
const revisionNewRequest=(await call(0,'sync')).revision;
assert.equal((await call(0,'friend-action',{id:users[2].id,action:'accept'})).ok,true);
assert.notEqual((await call(0,'sync')).revision,revisionNewRequest,'accepted request invalidates revision');
// Social 0.11: party roster, authenticated friend room lookup and live join.
const companyAdd=await call(0,'party',{action:'add',id:users[2].id});
assert.deepEqual(companyAdd.party,[users[2].id],'saved company contains selected friend');
assert.deepEqual((await call(0,'me')).party,[users[2].id],'company survives another request');
assert.equal((await call(0,'party',{action:'add',id:users[1].id})).httpStatus,403,'not a friend');
assert.equal((await call(0,'invite-party',{gameId:'lipki',roomId:room})).httpStatus,400,'cannot spoof hosting a room');
const invitationGroup=await call(0,'invite-party',{gameId:'lipki',roomId:room},{'x-pw-validated-room':room});
assert.equal(invitationGroup.sent,1);
assert.equal((await call(2,'me')).invites.some(i=>i.gameId==='lipki'&&i.fromId===users[0].id),true);
const groupAgain=await call(0,'invite-party',{gameId:'lipki',roomId:room},{'x-pw-validated-room':room});
assert.equal(groupAgain.sent,0,'do not create duplicate group invites');
const liveRoom={gameId:'lipki',roomId:room,joinable:true,players:1,maxPlayers:4};
let activityEnabled=true;
hub.env={POCKETNET:{
  idFromName:()=> 'test-global-pocketnet',
  get:()=>({fetch:async(request)=>{
    assert.equal(request.headers.get('x-pw-internal'),'1','only trusted DO room lookup');
    const {accountIds}=await request.json();
    const rooms={};
    if(activityEnabled&&accountIds.includes(users[2].id))rooms[users[2].id]=liveRoom;
    return Response.json({rooms});
  }})
}};
const publicFriends=await call(0,'me');
assert.equal(publicFriends.friends.find(p=>p.id===users[2].id)?.activity?.roomId,room);
const verifiedJoin=await call(0,'join-friend',{id:users[2].id});
assert.equal(verifiedJoin.url,'/apps/lipki/?room='+room);
assert.equal((await call(2,'profile',{background:'forest',frame:'clean',artwork:'',
  favoriteGame:'',discoverable:true,presenceVisible:false,allowInvites:true})).ok,true);
assert.equal((await call(0,'me')).friends.find(p=>p.id===users[2].id).activity,null,
  'private presence hides the active room even from friends');
assert.equal((await call(0,'join-friend',{id:users[2].id})).httpStatus,409);
assert.equal((await call(2,'profile',{background:'forest',frame:'clean',artwork:'',
  favoriteGame:'',discoverable:true,presenceVisible:true,allowInvites:true})).ok,true);
assert.equal((await call(1,'join-friend',{id:users[2].id})).httpStatus,403,'strangers may not resolve a room');
const revisionJoined=(await call(0,'sync')).revision;
activityEnabled=false;
assert.notEqual((await call(0,'sync')).revision,revisionJoined,'friend activity changes invalidates sync');
assert.equal((await call(0,'join-friend',{id:users[2].id})).httpStatus,409,'stale room cannot be joined');
// Company enforces three saved friends, even if the user has more friendships.
for(const [number,newId] of [
 [3,'dddddddd-dddd-4ddd-dddd-eeeeeeeeeeee'],
 [4,'dddddddd-dddd-4ddd-dddd-ffffffffffff'],
 [5,'dddddddd-dddd-4ddd-dddd-000000000000']
]){
 users[number]={id:newId,nickname:'Friend'+number,avatar:'clay'};
 await call(number,'me');
 assert.equal((await call(number,'friend-request',{id:users[0].id})).httpStatus,201);
 assert.equal((await call(0,'friend-action',{id:newId,action:'accept'})).ok,true);
}
assert.equal((await call(0,'party',{action:'add',id:users[3].id})).party.length,2);
assert.equal((await call(0,'party',{action:'add',id:users[4].id})).party.length,3);
assert.equal((await call(0,'party',{action:'add',id:users[5].id})).httpStatus,409);
assert.equal((await call(0,'party',{action:'remove',id:users[2].id})).party.length,2);
assert.equal((await call(0,'friend-action',{id:users[3].id,action:'remove'})).ok,true);
assert.equal((await call(0,'me')).party.includes(users[3].id),false,
 'removing a friend also removes their saved company membership');
console.log('Pocket Social: '+calls+' SQLite API assertions passed.');
