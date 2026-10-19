import test from 'node:test';
import assert from 'node:assert/strict';
import {QAgent} from '../lab-core.mjs';
import {makePolicy,validPolicy} from '../combat-core.mjs';
import {navigationTraits,warmStartCombatFromWorld} from '../agent-transfer.mjs';
import {simulateBattle} from '../combat-core.mjs';

test('no invented transfer when world knowledge is absent',()=>{
 assert.equal(warmStartCombatFromWorld(null),null);
 assert.equal(warmStartCombatFromWorld(new QAgent(1).serialize()),null);
});
test('trained world hazard-avoidance creates a bounded, deterministic combat warm start',()=>{
 const q=new QAgent(7).serialize();
 q.q=Array.from({length:40},(_,i)=>[i%4+','+(i%6)+'|33330000',[0.1,0.3,0.8,0.4,0]]);
 const p=warmStartCombatFromWorld(q),same=warmStartCombatFromWorld(q);
 assert.ok(p);assert.ok(validPolicy(p.policy));
 assert.deepEqual(p,same);
 assert.equal(p.traits.samples,40);
 assert.equal(p.policy.name,'world-navigation-transfer');
 assert.notDeepEqual(p.policy.weights,makePolicy('balanced',17).weights);
});
test('two independent learned agents fight two fair physics matches and produce replay frames',()=>{
 const policies=[makePolicy('aggressive',17),makePolicy('evasive',29)],results=[];
 for(let leg=0;leg<2;leg++){
  const reversed=leg===1;
  const sim=simulateBattle({arena:'cover',seed:41+leg*1031,teamSize:1,maxSeconds:35,
   loadouts:reversed?['guardian','skirmisher']:['skirmisher','guardian'],
   policies:reversed?policies.slice().reverse():policies},leg===0);
  assert.ok([-1,0,1].includes(sim.summary.winner));
  assert.ok(sim.summary.seconds>0);
  if(!leg)assert.ok(sim.frames.length>10);
  results.push(sim.summary.winner);
 }
 assert.equal(results.length,2);
});
