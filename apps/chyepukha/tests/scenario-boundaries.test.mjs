import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const game=new Function(source.replace(/export const /g,'const ').replace(/export default module;/,'return module;'))();
const makePlayers=()=>[{id:'author-a',name:'Автор А'},{id:'author-b',name:'Автор Б'}];

test('every built-in scenario has ten complete and distinct editorial stages',()=>{
 const [host,guest]=makePlayers();
 const lobby=game.createRoom({player:host,payload:{}}).state;
 const sets=game.viewForPlayer({state:lobby,player:host,players:[host]}).questionSets;
 assert.equal(sets.length,10);
 assert.equal(new Set(sets.map(s=>s.id)).size,10);
 for(const set of sets){
  let state=game.createRoom({player:host,payload:{settings:{questionSet:set.id,genre:'absurdComedy'}}}).state;
  state=game.onJoin({state,players:[host,guest]}).state;
  state=game.onMessage({state,player:host,payload:{type:'start'}}).state;
  assert.equal(state.total,10,set.id);
  const questions=Array.from({length:10},(_,round)=>{
   state.round=round;
   const view=game.viewForPlayer({state,player:host,players:[host,guest]});
   const q=view.sheet.question;
   assert.ok(q.prompt&&q.guidance&&q.creativeFreedom,set.id+' '+round);
   if(round<9){
    assert.ok(q.creativeFreedom.includes('Наступний автор окремо відповість'),set.id+' '+round);
    assert.ok(q.creativeFreedom.includes(view.sheet.nextQuestion),set.id+' '+round);
   } else assert.match(q.creativeFreedom,/Це фінал/);
   return q.prompt;
  });
  assert.equal(new Set(questions).size,10,set.id);
 }
});

test('all twelve genres provide genuinely differentiated writing guidance for all ten scenarios',()=>{
 const [host,guest]=makePlayers();
 const base=game.createRoom({player:host,payload:{}}).state;
 const info=game.viewForPlayer({state:base,player:host,players:[host]});
 assert.equal(info.genres.length,12);
 for(const set of info.questionSets){
  const hints=[];
  for(const genre of info.genres){
   let state=game.createRoom({player:host,payload:{settings:{questionSet:set.id,genre:genre.id}}}).state;
   state=game.onJoin({state,players:[host,guest]}).state;
   state=game.onMessage({state,player:host,payload:{type:'start'}}).state;
   const view=game.viewForPlayer({state,player:host,players:[host,guest]});
   assert.equal(view.sheet.genre,genre.id);
   assert.ok(view.sheet.question.guidance.length>35);
   hints.push(view.sheet.question.guidance);
  }
  assert.equal(new Set(hints).size,12,set.id);
 }
});

test('collapsing plan separates protagonist, goal and location without losing comedy',()=>{
 const sourceBank=source.match(/const BANK = (\{.*?\});\n/);
 assert.ok(sourceBank);
 const bank=JSON.parse(sourceBank[1]);
 const q=bank.collapsingPlan.questions;
 assert.match(q[0].creativeFreedom,/план/);
 assert.match(q[1].creativeFreedom,/локацію/);
 assert.match(q[2].prompt,/Де саме/);
 assert.match(q[1].guidance,/не її місце/);
});
