import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ITEMS,TREATMENTS,getRite,getIncident,evaluateRite} from '../engine.js';
const src=await readFile(new URL('../server/module.ts',import.meta.url),'utf8');
const {default:mod,MIN_PLAYERS,MAX_PLAYERS,RULESET_VERSION}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(src));
const people=n=>Array.from({length:n},(_,i)=>({id:'p'+i,name:'Жрец '+i,verified:false}));
function room(n=3){
 const players=people(n);let s=mod.createRoom({player:players[0]}).state;
 for(let i=1;i<n;i++)s=mod.onJoin({state:s,players:players.slice(0,i+1)}).state;
 let seq=0;
 const send=(index,payload)=>{
  const r=mod.onMessage({state:s,player:players[index],players,payload});
  assert.ok(r&&r.state&&Array.isArray(r.events));s=r.state;return r;
 };
 const act=(index,type,extra={})=>send(index,{type,phaseId:s.phaseId,seq:++seq,...extra});
 return {players,send,act,get s(){return s},set s(v){s=v}};
}
function optimal(s){
 const rite=getRite(s.match);let best=null;
 for(const item of ITEMS)for(const treatment of TREATMENTS)for(const bell of [1,2,3])
  for(const height of ['low','high']){
   const a={itemId:item.id,treatment:treatment.id,bell,height};
   const score=evaluateRite(rite,a,s.match.doctrines,getIncident(s.match)).score;
   if(!best||score>best.score)best={...a,score};
  }
 return best;
}
function playRound(r){
 const best=optimal(r.s);assert.ok(best.score>=4);
 for(let i=0;i<r.players.length;i++)for(const task of r.s.assignments[r.players[i].id]){
  if(task==='need'||task==='taboo')r.act(i,'reveal',{task});
  if(task==='offering')r.act(i,'set',{task,itemId:best.itemId,treatment:best.treatment});
  if(task==='bell')r.act(i,'set',{task,value:best.bell});
  if(task==='height')r.act(i,'set',{task,value:best.height});
 }
 for(let i=0;i<r.players.length;i++)r.act(i,'lock');
 assert.equal(r.s.phase,'judgment');assert.equal(r.s.match.judgment.score,best.score);
 for(let i=0;i<r.players.length;i++)r.act(i,'ack');
 if(r.s.phase==='end')return;
 assert.equal(r.s.phase,'dogma');
 for(let i=0;i<r.players.length;i++)r.act(i,'vote',{id:r.s.match.offers[0]});
 assert.equal(r.s.phase,'play');
}
test('role schema assigns each of five duties exactly once at every player count',()=>{
 assert.equal(MIN_PLAYERS,2);assert.equal(MAX_PLAYERS,5);assert.equal(RULESET_VERSION,3);
 for(const n of [2,3,4,5]){
  const r=room(n);const assignments=Object.values(r.s.assignments).flat().sort();
  assert.deepEqual(assignments,['bell','height','need','offering','taboo'].sort());
  assert.equal(r.s.phase,'lobby');
 }
});
test('role-specific secrets are never in the room projections',()=>{
 const r=room(5);r.send(0,{type:'start'});
 const s=r.s,serialized=JSON.stringify(s);
 assert.ok(serialized.includes('"seed"')&&serialized.includes('"order"'));
 for(let i=0;i<5;i++){
  const view=mod.viewForPlayer({state:s,player:r.players[i],players:r.players});
  const json=JSON.stringify(view);
  assert.ok(!json.includes('"seed"')&&!json.includes('"order"')&&!json.includes('"riddle"'));
  assert.ok(!json.includes('"lastSeq"'));
  assert.deepEqual(Object.keys(view.ownClues).sort(),view.ownTasks.slice().sort().map(t=>t==='offering'?'treatment':t).sort());
  assert.equal(view.ownSeq,0);
 }
 const recipient=mod.viewForPlayer({state:s,player:r.players[0]});
 assert.deepEqual(recipient.ownTasks,['need']);
 assert.equal(recipient.ownClues.treatment,undefined);
 assert.equal(recipient.ownClues.bell,undefined);
});
test('unauthorized roles cannot forge other players actions or public prophecy',()=>{
 const r=room(3);r.send(0,{type:'start'});
 const before=structuredClone(r.s);
 r.act(0,'set',{task:'offering',itemId:'crown',treatment:'gild'});
 assert.equal(r.s.altar.itemId,null);
 r.act(1,'reveal',{task:'need'});
 assert.equal(r.s.done.need,undefined);
 r.act(1,'set',{task:'offering',itemId:'inject',treatment:'wash'});
 assert.equal(r.s.altar.itemId,null);
 r.act(0,'call',{kind:'<script>alert(1)</script>'});
 assert.equal(r.s.announcements.length,0);
 const good=r.act(0,'reveal',{task:'need'});
 assert.equal(r.s.done.need,true);
 assert.equal(r.s.announcements[0].kind,'revelation');
 assert.ok(!JSON.stringify(mod.viewForPlayer({state:r.s,player:r.players[1]})).includes('"seed"'));
 assert.equal(before.match.round,r.s.match.round);
});
test('duplicate sequence and stale phases cannot mutate committed action',()=>{
 const r=room(2);r.send(0,{type:'start'});
 const phase=r.s.phaseId;
 const seq=10;
 r.send(0,{type:'reveal',task:'need',phaseId:phase,seq});
 const rev=r.s.revision;
 r.send(0,{type:'reveal',task:'taboo',phaseId:phase,seq});
 assert.equal(r.s.revision,rev);
 assert.equal(r.s.done.taboo,undefined);
 r.send(0,{type:'reveal',task:'taboo',phaseId:'wrong-phase',seq:12});
 assert.equal(r.s.done.taboo,undefined);
});
test('five complete server-authoritative ceremonies for 2/3/4/5 players',()=>{
 for(const n of [2,3,4,5]){
  const r=room(n);r.send(0,{type:'start'});
  for(let i=0;i<5;i++){assert.equal(r.s.match.round,i);playRound(r);}
  assert.equal(r.s.phase,'end');assert.equal(r.s.match.history.length,5);
  assert.ok(r.s.match.faith>0);
 }
});
test('deadline fallback, vote tie and reconnect views',()=>{
 const r=room(3);r.send(0,{type:'start'});
 let state=r.s;state.deadlineAt=Date.now()-1;r.s=state;
 r.send(1,{type:'pulse'});
 assert.equal(r.s.phase,'judgment');
 assert.equal(r.s.match.history[0].itemId,'bread');
 assert.equal(r.s.match.judgment.unfinished.length,5);
 for(let i=0;i<3;i++)r.act(i,'ack');
 assert.equal(r.s.phase,'dogma');
 const codes=[...r.s.match.offers];
 r.act(0,'vote',{id:codes[0]});r.act(1,'vote',{id:codes[1]});
 // Lost voter does not block forever; tie picks first offered doctrine.
 r.s.deadlineAt=Date.now()-1;r.send(2,{type:'pulse'});
 assert.equal(r.s.phase,'play');
 assert.equal(r.s.match.doctrines[0],codes[0]);
 const snapshot=mod.viewForPlayer({state:r.s,player:r.players[1]});
 assert.deepEqual(snapshot.ownTasks,['bell','height'],'roles rotate after the first council');
 assert.equal(snapshot.match.round,1);
});
test('leaving player reassigns without deadlocking the round',()=>{
 const r=room(5);r.send(0,{type:'start'});
 const prior=r.s.phaseId;
 const left=mod.onLeave({state:r.s,players:r.players.slice(0,4),player:r.players[4]});
 assert.equal(left.state.phase,'play');
 assert.notEqual(left.state.phaseId,prior);
 assert.deepEqual(Object.values(left.state.assignments).flat().sort(),['need','taboo','offering','bell','height'].sort());
 assert.deepEqual(left.state.done,{});
});
