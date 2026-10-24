import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

let clock=100_000;
class Clock extends Date{static now(){return clock}}
const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const api={};runInNewContext(compiled,{exports:api,Date:Clock,Math,Array,Number,Object,Error,JSON,Set,Map,console});
const game=api.default,participants=[{id:'host',name:'Host'},{id:'b',name:'B'},{id:'c',name:'C'}];
const state=game.createRoom({player:participants[0]}).state;
for(const player of participants.slice(1))game.onJoin({state,player,players:participants});
const send=(id,payload)=>game.onMessage({state,player:participants.find(p=>p.id===id)||{id,name:'outsider'},players:participants,payload});
const ballot=(n=1)=>[n,0,0,0,0];
const current=()=>({round:state.round,turn:state.turn,targetId:state.participants[state.turn]?.id});

assert.equal(send('outsider',{type:'sync'}).events[0].type,'notice','a nonmember cannot fetch active/private state');
assert.equal(send('outsider',{type:'time_ping',stamp:1}).events[0].type,'notice','a nonmember cannot probe hidden state');
const atStart=JSON.stringify(state);
assert.equal(send('b',{type:'does_not_exist'}).events.length,0,'unknown command cannot broadcast room state');
assert.equal(send('b',{type:'advance'}).events.length,0,'unauthorized phase advances cannot broadcast');
assert.equal(JSON.stringify(state),atStart,'rejected commands leave state unchanged');
send('host',{type:'start',rounds:2,drawingSeconds:300});
assert.equal(state.phase,'preview');
assert.throws(()=>game.onJoin({state,player:{id:'outsider',name:'New'},players:participants}),/room_in_progress/,'late newcomers are rejected by the module too');
clock=state.deadline+1;send('host',{type:'pulse'});
assert.equal(state.phase,'drawing');
for(const p of participants)send(p.id,{type:'submit',strokes:[]});
assert.equal(state.phase,'voting');
const first=current();
assert.equal(send('b',{type:'vote',chips:ballot()}).events[0].type,'notice','missing ballot identity rejected');
assert.equal(send('b',{type:'vote_draft',round:0,turn:0,targetId:'host',chips:ballot()}).events[0].type,'notice','old draft rejected');
assert.equal(send('b',{type:'vote_draft',...first,chips:ballot()}).events.length,0,'current draft accepted privately');
assert.equal(state.voteDrafts.host.b[0],1);
assert.equal(send('b',{type:'vote',...first,chips:ballot()}).events.at(-1).type,'vote_saved','valid current vote accepted');
assert.equal(send('b',{type:'vote',...first,chips:ballot()}).events.at(-1).type,'vote_saved','duplicate final vote idempotently acknowledged');
assert.equal(Object.keys(state.votes.host).length,1);
send('c',{type:'vote',...first,chips:ballot()});
assert.equal(state.phase,'verdict','all real voters advance');
clock=state.deadline+1;send('host',{type:'pulse'});
clock=state.deadline+1;send('host',{type:'pulse'});
assert.equal(state.phase,'voting');assert.equal(state.turn,1);
const second=current(),before=JSON.stringify(state.votes);
assert.equal(send('host',{type:'vote',...first,chips:ballot(3)}).events[0].type,'notice','old final vote cannot score on second artist');
assert.equal(send('host',{type:'vote_draft',...first,chips:ballot(3)}).events[0].type,'notice','old draft cannot save for second artist');
assert.equal(send('host',{type:'vote',round:second.round,turn:second.turn,targetId:'host',chips:ballot()}).events[0].type,'notice','wrong target cannot pass even with valid turn');
assert.equal(JSON.stringify(state.votes),before,'rejected delayed packets leave scores intact');
assert.equal(send('host',{type:'vote',...second,chips:ballot()}).events.at(-1).type,'vote_saved','legitimate next vote accepted');
const lobby=game.createRoom({player:participants[0]}).state;
game.onJoin({state:lobby,player:participants[1],players:participants});
game.onJoin({state:lobby,player:participants[2],players:participants});
const kick=game.onMessage({state:lobby,player:participants[0],players:participants,payload:{type:'kick_player',targetId:'b'}});
assert(kick.events.some(e=>e.type==='player_kicked'&&e.to==='b'),'authorized kick emits eviction');
assert(lobby.bannedIds.includes('b'),'kick persists banned seat');
assert.throws(()=>game.onJoin({state:lobby,player:participants[1],players:participants}),/room_kicked/,'evicted guest cannot rejoin');
const hub=readFileSync(new URL('../../../pocketnet/hub.mjs',import.meta.url),'utf8');
assert.match(hub,/room\.state\.bannedAccounts\.push\(accountId\)/,'PocketNet persists verified-account bans');
assert.match(hub,/room\.state\.phase!=='lobby'/,'PocketNet blocks mid-round newcomers');
assert.match(hub,/this\.zamazkaSyncAt\.set\(ws,time\)/,'PocketNet throttles large sync responses');
assert.match(hub,/ZAMAZKA_SECURE_COMMANDS\.has\(command\)/,'PocketNet discards unknown game commands before cloning artwork');
const client=readFileSync(new URL('../app.js',import.meta.url),'utf8');
assert.match(client,/\.\.\.voteContext\(view\)/,'both vote sends include current author identity');
console.log('ZAMAZKA security: member-only sync, rejected old ballots/drafts, idempotent vote, kick bans, late-join and broadcast guard OK');


// The first verdict must not expose future authors' assignments.
// A whole round can contain up to eight independent presentations.
{
 let clock=1_000_000;
 class GalleryClock extends Date{static now(){return clock}}
 const exp={};
 runInNewContext(compiled,{exports:exp,Date:GalleryClock,Math,Array,Number,Object,Error,JSON,Set,Map,console});
 const game2=exp.default;
 const people2=[{id:'ga',name:'A'},{id:'gb',name:'B'},{id:'gc',name:'C'}];
 const room=game2.createRoom({player:people2[0]}).state;
 for(const person of people2.slice(1))game2.onJoin({state:room,player:person,players:people2});
 const send2=(who,payload)=>game2.onMessage({state:room,player:people2.find(p=>p.id===who),players:people2,payload});
 const observe=()=>send2('gb',{type:'sync'}).events[0].payload;
 const cast=()=>{
  const targetId=room.participants[room.turn].id;
  for(const member of people2)if(member.id!==targetId)
   send2(member.id,{type:'vote',round:room.round,turn:room.turn,targetId,chips:[1,0,0,0,0]});
 };
 send2('ga',{type:'start',rounds:1});
 clock=room.deadline+1;send2('ga',{type:'pulse'});
 for(const member of people2)send2(member.id,{type:'submit',strokes:[]});
 assert.equal(room.phase,'voting');
 assert.equal(observe().gallery,null,'voting does not send future galleries');
 cast();
 assert.equal(room.phase,'verdict');
 let gallery=observe().gallery;
 assert(gallery[0]&&Array.isArray(gallery[0].strokes),'first verdict shows its author');
 assert.equal(gallery[1],null,'second author remains private before own vote');
 assert.equal(gallery[2],null,'third author remains private before own vote');
 clock=room.deadline+1;send2('ga',{type:'pulse'});
 assert.equal(room.phase,'reveal');
 gallery=observe().gallery;
 assert(gallery[0]&&gallery[1]===null&&gallery[2]===null,'reveal does not send future images');
 clock=room.deadline+1;send2('ga',{type:'pulse'});
 assert.equal(room.phase,'voting');assert.equal(room.turn,1);
 assert.equal(observe().gallery,null,'no leftover private images in next voting');
 cast();
 assert.equal(room.phase,'verdict');
 gallery=observe().gallery;
 assert(gallery[0]&&gallery[1]&&gallery[2]===null,'second verdict includes only already judged works');
 clock=room.deadline+1;send2('ga',{type:'pulse'});
 clock=room.deadline+1;send2('ga',{type:'pulse'});
 cast();
 assert.equal(room.phase,'verdict');
 clock=room.deadline+1;send2('ga',{type:'pulse'});
 clock=room.deadline+1;send2('ga',{type:'pulse'});
 assert.equal(room.phase,'round-review');
 assert(observe().gallery.every(g=>g&&Array.isArray(g.strokes)),'full gallery available after final reveal');
}

// Low-cost visual actions must never be able to amplify complete room states
// while a match is active. Identical and rapid updates in the lobby are inert.
{
 let clock=10000;
 class ReadyClock extends Date{static now(){return clock}}
 const exp={};
 runInNewContext(compiled,{exports:exp,Date:ReadyClock,Math,Array,Number,Object,Error,JSON,Set,Map,console});
 const m=exp.default,first={id:'xx',name:'X'},second={id:'yy',name:'Y'};
 const s=m.createRoom({player:first}).state;
 m.onJoin({state:s,player:second,players:[first,second]});
 const send=(id,payload)=>m.onMessage({state:s,player:id==='xx'?first:second,players:[first,second],payload});
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';
 assert(send('xx',{type:'emblem',image:png}).events.some(e=>e.type==='state'));
 assert.equal(send('xx',{type:'emblem',image:png}).events.length,0,'identical emblem generates no broadcast');
 assert.equal(send('xx',{type:'emblem',image:null}).events.length,0,'rapid emblem toggle is throttled');
 clock+=2000;
 assert(send('xx',{type:'emblem',image:null}).events.some(e=>e.type==='state'),'later remove allowed');
 send('xx',{type:'start',preload:true,rounds:1});
 assert.equal(s.phase,'preparing');
 assert.equal(send('xx',{type:'emblem',image:png}).events[0].type,'notice','emblem cannot broadcast galleries');
 assert(send('xx',{type:'art_ready',round:1}).events.some(e=>e.type==='state'));
 assert.equal(send('xx',{type:'art_ready',round:1}).events.length,0,'repeated ready does not broadcast');
}
console.log('ZAMAZKA privacy: future artwork remains private until its own verdict; decorative packet amplification blocked');
