import test from 'node:test';
import assert from 'node:assert/strict';
import {initialMatch,validatePlan,simulateRound,aiPlan} from '../engine.js';
import module,{viewForPlayer} from '../server/module.ts';
const all=['up','down','left','right','shield'],atk=d=>({type:'attack',dirs:d});
const ready=()=>({A:all,B:all});
const person=id=>({id,name:id,verified:false});
test('original five-command constraints and repeatable movement',()=>{
 assert.equal(validatePlan(['up','up','down','left','right']),null);
 assert.equal(validatePlan(['up','up',atk(['down','left']),'right','shield']),null);
 assert.equal(validatePlan(['up',atk(['up']),'shield','left','right']),'attack_direction_conflict');
 assert.equal(validatePlan([atk(['up','up']),'down','left','right','shield']),'invalid_attack_directions');
 assert.equal(validatePlan(['shield','shield','left','right','up']),'one_shield_only');
 assert.equal(validatePlan(['up','left','right']), 'exactly_five_actions');
});
test('five frames, position limits and round 4 exhaustion',()=>{
 let g=initialMatch();
 for(let i=1;i<=4;i++){const r=simulateRound(g,ready());assert.equal(r.record.frames.length,5);g=r.match;if(i<4)assert.equal(g.round,i+1)}
 assert.equal(g.outcome,'draw');assert.equal(g.replays.length,4);
});
test('simultaneous attacks trade and shields prevent damage',()=>{
 const start=initialMatch();start.units.A={x:2,y:2,alive:true};start.units.B={x:2,y:3,alive:true};
 const a=[atk(['down']),'up','left','right','shield'],b=[atk(['up']),'down','left','right','shield'];
 assert.equal(simulateRound(start,{A:a,B:b}).match.outcome,'draw');
 assert.equal(simulateRound(start,{A:a,B:['shield','up','down','left','right']}).match.units.B.alive,true);
});
test('round-four perimeter collapses after first beat',()=>{
 const g=initialMatch();g.round=4;const r=simulateRound(g,ready());
 assert.equal(r.record.frames[0].edgesCollapsed,true);assert.equal(r.record.frames[0].outcome,'draw');
 assert.ok(r.record.frames[0].events.some(e=>e.type==='collapse'));
});
test('AI generates legal commands across difficulties',()=>{
 for(const diff of ['easy','normal','hard','expert','insane'])for(let i=0;i<4;i++)
  assert.equal(validatePlan(aiPlan(initialMatch(),all,diff)),null,diff);
});
test('PocketNet hides pending opponent commands, rejects stale actions',()=>{
 const a=person('a'),b=person('b');let state=module.createRoom({player:a}).state;
 state=module.onJoin({state,players:[a,b],player:b}).state;
 state=module.onMessage({state,player:a,players:[a,b],payload:{type:'start'}}).state;
 assert.equal(state.phase,'planning');
 state=module.onMessage({state,player:a,players:[a,b],payload:{type:'plan',actions:all,round:1,revision:0}}).state;
 assert.equal(viewForPlayer({state,player:b}).ownPlan.length,0);
 assert.equal(viewForPlayer({state,player:b}).ready.A,true);
 assert.equal(viewForPlayer({state,player:a}).ownPlan.length,5);
 state=module.onMessage({state,player:b,players:[a,b],payload:{type:'plan',actions:all,round:1,revision:0}}).state;
 assert.equal(state.match.replays.length,1);assert.equal(state.match.round,2);
 assert.ok(viewForPlayer({state,player:a}).match.replays[0].plans.B);
 const stale=module.onMessage({state,player:a,players:[a,b],payload:{type:'plan',actions:all,round:1,revision:0}});
 assert.equal(stale.state.pending.A,null);assert.equal(stale.events[0].type,'notice');
});
test('server rejects invalid actions and non-host starts',()=>{
 const a=person('a'),b=person('b');let state=module.createRoom({player:a}).state;
 state=module.onJoin({state,player:b,players:[a,b]}).state;
 assert.equal(module.onMessage({state,player:b,players:[a,b],payload:{type:'start'}}).state.phase,'lobby');
 state=module.onMessage({state,player:a,players:[a,b],payload:{type:'start'}}).state;
 const bad=module.onMessage({state,player:b,players:[a,b],payload:{type:'plan',round:1,revision:0,actions:['up','shield',{type:'attack',dirs:['up']},'left','right']}});
 assert.equal(bad.events[0].type,'notice');assert.equal(bad.state.pending.B,null);
});
