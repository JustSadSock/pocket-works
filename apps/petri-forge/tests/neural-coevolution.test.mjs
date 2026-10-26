import test from 'node:test';
import assert from 'node:assert/strict';
import {PpoPolicy,PpoTrainer} from '../ppo.mjs';
import {battleNeuralEpisode} from '../neural-combat.mjs';
import {NeuralCoevolution,validateCoevolution,coevolutionPlan,evaluateCoevolution} from '../neural-coevolution.mjs';

test('two coevolving policies record separate real trajectories and both change weights',()=>{
 const a=new PpoPolicy(15),b=new PpoPolicy(19);
 const ta=new PpoTrainer(a,{seed:1,rolloutSteps:24,epochs:1,minibatchSize:12});
 const tb=new PpoTrainer(b,{seed:2,rolloutSteps:24,epochs:1,minibatchSize:12});
 const aa=a.serialize(),bb=b.serialize();
 const match=battleNeuralEpisode({policy:a,opponent:b,learn:ta,learnOpponent:tb,
  role:'archer',enemyRole:'swordsman',arena:'cover',seed:300,maxSeconds:4});
 assert.equal(ta.buffer.length,tb.buffer.length);
 assert.equal(ta.buffer.length,match.moves);
 assert.ok(ta.buffer.some(x=>x.reward!==0));
 assert.ok(tb.buffer.some(x=>x.reward!==0));
 ta.optimize();tb.optimize();
 assert.notDeepEqual(a.serialize().weights,aa.weights);
 assert.notDeepEqual(b.serialize().weights,bb.weights);
});
test('coevolution schedule shares seeds and swaps sides, rejects invalid inputs',()=>{
 const opts=validateCoevolution({episodes:12,seed:330,arena:'hazards'});
 const sequence=Array.from({length:12},(_,i)=>coevolutionPlan(i,opts));
 for(let i=0;i<12;i+=2){
  assert.equal(sequence[i].seed,sequence[i+1].seed);
  assert.deepEqual([sequence[i].side,sequence[i+1].side],[0,1]);
  assert.equal(sequence[i].arena,sequence[i+1].arena);
 }
 assert.deepEqual([...new Set(sequence.map(x=>x.arena))].sort(),['cover','hazards','open']);
 for(const invalid of [{episodes:5},{episodes:151},{episodes:7},{roleA:'archer',roleB:'archer'},
  {arena:'fake'},{snapshotA:{type:'neural-ppo'}},{seed:0}]){
  assert.throws(()=>validateCoevolution(invalid));
 }
});
test('true coevolution creates paired checkpoints and scores fixed holdout without changing weights',()=>{
 const opts={episodes:6,seed:71,roleA:'archer',roleB:'swordsman',arena:'cover'};
 const exp=new NeuralCoevolution(opts);
 const originalA=exp.a.serialize(),originalB=exp.b.serialize();
 const initial=evaluateCoevolution(originalA,originalB,exp.options);
 assert.deepEqual(initial,exp.initial);
 assert.equal(initial.count,6);
 assert.equal(initial.fixed.archer.count,6);
 assert.equal(initial.fixed.swordsman.count,6);
 for(let i=0;i<6;i++)exp.step();
 assert.equal(exp.generations.length,2);
 assert.equal(exp.pool.length,2);
 assert.deepEqual(exp.pool[0].a,originalA);
 assert.deepEqual(exp.pool[0].b,originalB);
 assert.notDeepEqual(exp.a.serialize().weights,originalA.weights);
 assert.notDeepEqual(exp.b.serialize().weights,originalB.weights);
 assert.ok(exp.a.updates>0&&exp.b.updates>0);
 assert.equal(exp.history.length,6);
 assert.deepEqual(exp.generations[1].evaluation.arenas&&Object.keys(exp.generations[1].evaluation.arenas).sort(),
  ['cover','hazards','open']);
 const beforeA=exp.a.serialize(),beforeB=exp.b.serialize();
 evaluateCoevolution(beforeA,beforeB,exp.options);
 assert.deepEqual(exp.a.serialize(),beforeA);
 assert.deepEqual(exp.b.serialize(),beforeB);
 const report=exp.finish();
 assert.equal(report.type,'neural-combat-coevolution');
 assert.equal(report.generations.length,2);
 assert.equal(report.protocol.bothSidesLearn,true);
 assert.throws(()=>exp.step(),/завершено/);
});
test('stop is deterministic and preserves both partial policies, one generation',()=>{
 const run=()=>{
  const exp=new NeuralCoevolution({episodes:6,seed:499});
  exp.step();
  return exp.finish(true);
 };
 const a=run(),b=run();
 assert.deepEqual(a,b);
 assert.equal(a.completed,1);
 assert.equal(a.generations.length,2);
 assert.ok(a.modelA.updates>0&&a.modelB.updates>0);
 assert.equal(a.stopped,true);
});
