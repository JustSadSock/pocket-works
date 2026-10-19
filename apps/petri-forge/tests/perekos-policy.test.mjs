import test from 'node:test';
import assert from 'node:assert/strict';
import {PerekosEnvironment,validPerekosAction} from '../perekos-adapter.mjs';
import {createPerekosPolicy,validatePerekosPolicy,mutatePerekosPolicy,perekosControl,choosePerekosRune,tacticalTransfer,MAGE_CHOICES} from '../perekos-policy.mjs';
import {makePolicy as combatPolicy} from '../combat-core.mjs';

test('policy weights are bounded and mutation is reproducible',()=>{
 const brain=createPerekosPolicy(99,'evasive');
 assert.ok(validatePerekosPolicy(brain));
 assert.deepEqual(mutatePerekosPolicy(brain,12),mutatePerekosPolicy(brain,12));
 for(let seed=1;seed<100;seed++)assert.ok(validatePerekosPolicy(mutatePerekosPolicy(brain,seed,2)));
 assert.equal(validatePerekosPolicy({...brain,weights:brain.weights.slice(0,5)}),false);
});
test('Perekos agents use legal movement, aim and genuine fixed-step controls',()=>{
 for(const mage of MAGE_CHOICES){
  const env=new PerekosEnvironment({seed:57,first:mage.id,second:'pebble',limitTicks:750});
  const brain=createPerekosPolicy(17,'aggressive'),rival=createPerekosPolicy(91,'evasive');
  for(let i=0;i<700&&env.state.phase==='fight';i++){
   const command=perekosControl(env.observe(0),brain,0,env.steps);
   const opponent=perekosControl(env.observe(1),rival,1,env.steps);
   assert.ok(validPerekosAction(command));
   assert.ok(validPerekosAction(opponent));
   const s=env.step(command,opponent);
   assert.ok(Number.isFinite(s.reward));
  }
  assert.ok(env.steps>0);
 }
});
test('rune drafting uses real offered options and advances the match',()=>{
 const env=new PerekosEnvironment({seed:21});
 const brain=createPerekosPolicy(42);
 for(let i=0;i<1900&&env.state.phase==='fight';i++)env.step({x:0,y:0});
 assert.equal(env.state.phase,'draft');
 const offers=env.observe().offers;
 const rune=choosePerekosRune(env.observe(),brain);
 assert.ok(offers.includes(rune));
 env.step({draft:rune});
 assert.equal(env.state.phase,'fight');
 assert.ok(env.state.actors[0].runes.includes(rune));
});
test('cross-game heuristic transfer makes a valid, clearly tagged policy',()=>{
 const source=combatPolicy('evasive',8);
 const mapped=tacticalTransfer(source);
 assert.ok(validatePerekosPolicy(mapped));
 assert.equal(mapped.source,'heuristic-transfer');
 const obs=new PerekosEnvironment({seed:7}).observe();
 assert.ok(validPerekosAction(perekosControl(obs,mapped)));
});
test('same agent and seed produce identical actions and trajectories',()=>{
 const left=new PerekosEnvironment({seed:12}),right=new PerekosEnvironment({seed:12});
 const brain=createPerekosPolicy(4);
 for(let t=0;t<550;t++){
  const action=perekosControl(left.observe(),brain,0,t);
  assert.deepEqual(left.step(action),right.step(action));
 }
});
