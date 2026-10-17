
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,setAction,getRite,ITEMS,DOCTRINES,evaluateRite,commitRite,continueFromJudgment,
 chooseDoctrine,conveneCouncil,loadGame,getBestPossible,MAX_ROUNDS,isWin} from '../engine.mjs';
test('seed is deterministic and rites never repeat',()=>{
 const a=createGame(413),b=createGame(413);
 assert.deepEqual(a,b);assert.equal(new Set(a.order).size,MAX_ROUNDS);
 assert.notDeepEqual(a.order,createGame(414).order);
});
test('no item means no sacrifice and invalid actions are ignored',()=>{
 const s=createGame(41);assert.equal(commitRite(s),s);
 assert.equal(setAction(s,{itemId:'__bad__'}).actions.itemId,null);
 assert.equal(setAction(s,{bell:99}).actions.bell,1);
});
test('all rites solvable even with three dogmas',()=>{
 for(let seed=1;seed<=1000;seed++){
  let state=createGame(seed);
  for(let i=0;i<MAX_ROUNDS;i++){
   state={...state,doctrines:DOCTRINES.slice(seed%5,seed%5+3).map(d=>d.id)};
   assert.ok(getBestPossible(state)>=4,'unsolvable seed '+seed+' / rite '+i);
   const item=ITEMS[(seed+i)%ITEMS.length];
   state=setAction(state,{itemId:item.id,treatment:'wash',bell:2,height:'high'});
   state=commitRite(state);
   assert.equal(state.history.length,i+1);
   state=continueFromJudgment(state);
   if(state.phase==='end')break;
   state=chooseDoctrine(state,state.offers[0]);
  }
 }
});
test('all possible input combos have finite bounded score',()=>{
 for(const rite of [getRite(createGame(17)),getRite(createGame(19))])
 for(const item of ITEMS)for(const treatment of ['wash','smoke','gild'])
 for(const bell of [1,2,3])for(const height of ['low','high']){
  const r=evaluateRite(rite,{itemId:item.id,treatment,bell,height},['goose','height','thunder']);
  assert.ok(Number.isFinite(r.score)&&r.score>=-3&&r.score<=10);
 }
});
test('end-to-end deterministic five-round game with dogma consequences',()=>{
 let a=createGame(124),b=createGame(124);
 for(let round=0;round<MAX_ROUNDS;round++){
  assert.equal(a.phase,'play');
  const rite=getRite(a);
  const item=ITEMS.find(x=>x[rite.need]===rite.value&&(rite.taboo==='metal'?x.material!=='metal':
   rite.taboo==='living'?x.kind!=='living':rite.taboo==='food'?x.kind!=='food':x.color!==rite.taboo))||ITEMS[0];
  for(const label of ['a','b']){}
  a=setAction(a,{itemId:item.id,treatment:rite.treatment,bell:rite.bell,height:rite.height});
  b=setAction(b,{itemId:item.id,treatment:rite.treatment,bell:rite.bell,height:rite.height});
  a=commitRite(a);b=commitRite(b);
  assert.deepEqual(a,b);
  a=continueFromJudgment(a);b=continueFromJudgment(b);
  if(a.phase==='end')break;
  assert.equal(a.phase,'dogma');
  a=chooseDoctrine(a,a.offers[0]);b=chooseDoctrine(b,b.offers[0]);
  assert.deepEqual(a,b);
 }
 assert.equal(a.phase,'end');assert.equal(isWin(a),true);
 assert.equal(a.history.length,MAX_ROUNDS);
 assert.deepEqual(loadGame(JSON.parse(JSON.stringify(a))),a);
});
test('doctrines change actual outcome and council is once per game',()=>{
 const s=createGame(7);
 const action={itemId:'goose',treatment:'wash',bell:3,height:'high'};
 const rite=getRite(s);
 const plain=evaluateRite(rite,action,[]);
 const sacred=evaluateRite(rite,action,['goose','washing','height']);
 assert.equal(sacred.score,plain.score+4);
 let c={...s,faith:4,doctrines:['goose','washing']};
 c=conveneCouncil(c);
 assert.equal(c.faith,3);assert.deepEqual(c.doctrines,['washing']);
 assert.equal(conveneCouncil(c),c);
});
test('no corruption or external executable input through storage',()=>{
 const s=createGame(18);
 assert.equal(loadGame({...s,order:[-1,0,1,2,3]}),null);
 assert.equal(loadGame({...s,actions:{itemId:'<script>',bell:2,height:'low',treatment:null}}),null);
 assert.equal(loadGame({...s,phase:'god_mode'}),null);
 assert.equal(loadGame(null),null);
});
