import test from 'node:test';
import assert from 'node:assert/strict';
import {createScenario} from '../lab-core.mjs';
import {PpoPolicy,PpoTrainer,computeGAE,ppoEpisode,validatePpoPolicy,PPO_DEFAULTS} from '../ppo.mjs';

const example=()=>({
 tiles:Array.from({length:7},()=>Array(7).fill(0)),
 pos:[5,5],goalVec:[2,2]
});
const almost=(actual,expected,tolerance=1e-7)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} vs ${expected}`);

test('GAE discounts rewards and breaks temporal credit at episode boundaries',()=>{
 const sequence=[
  {reward:1,value:0,done:false},
  {reward:2,value:0,done:true},
  {reward:3,value:0,done:false}
 ];
 const a=computeGAE(sequence,{gamma:1,gaeLambda:1},4);
 almost(a[0].advantage,3);
 almost(a[1].advantage,2);
 almost(a[2].advantage,7);
 almost(a[0].returnValue,3);
 const zero=computeGAE(sequence,{gamma:0,gaeLambda:.95},4);
 almost(zero[0].advantage,1);
 almost(zero[1].advantage,2);
 almost(zero[2].advantage,3);
});

test('PPO uses real clipped policy-gradient and optimizer changes serialized weights',()=>{
 const policy=new PpoPolicy(37);
 const obs=example(),other={...example(),goalVec:[4,-3]};
 const initial=policy.serialize();
 assert.equal(validatePpoPolicy(initial),true);
 const training=new PpoTrainer(policy,{rolloutSteps:16,epochs:2,minibatchSize:8,seed:8});
 for(let i=0;i<32;i++){
  const sample=policy.sample(i%2?obs:other);
  training.add(i%2?obs:other,{reward:i%3?-.04:1,done:i%11===10},sample.actionIndex,sample.logProb,sample.value);
 }
 assert.equal(training.ready,true);
 const report=training.optimize();
 assert.equal(training.buffer.length,0);
 assert.equal(report.steps,32);
 assert.ok(report.updates>=2);
 for(const n of ['policyLoss','valueLoss','entropy','approxKL','clipFraction','gradNorm'])assert.ok(Number.isFinite(report[n]),n);
 assert.ok(report.clipFraction>=0&&report.clipFraction<=1);
 assert.notDeepEqual(policy.serialize().weights,initial.weights);
 assert.equal(policy.updates,report.updates);
 const restored=new PpoPolicy(4);restored.load(policy.serialize());
 assert.deepEqual(restored.serialize(),policy.serialize());
 assert.deepEqual(restored.forward(obs).probabilities,policy.forward(obs).probabilities);
 assert.deepEqual(PPO_DEFAULTS.rolloutSteps,512);
});

test('PPO clipped gradient stops policy update when probability exceeds ceiling',()=>{
 const p=new PpoPolicy(14),observation=example();
 const weights=p.serialize();
 const current=p.forward(observation),index=0;
 const oldLogProb=Math.log(current.probabilities[index]/2); // ratio > 1.2
 const sample={obs:observation,actionIndex:index,logProb:oldLogProb,
  value:current.value,advantage:1,returnValue:current.value};
 const result=p.updateMinibatch([sample],{...PPO_DEFAULTS,entropyCoef:0,valueCoef:0});
 almost(result.clipFraction,1);
 // No policy or value term can change weights in the clipped region.
 assert.deepEqual(p.serialize().weights,weights.weights);
});

test('PPO rollout uses genuine environment rewards, learns across batches and remains finite',()=>{
 const policy=new PpoPolicy(4),trainer=new PpoTrainer(policy,{rolloutSteps:64,epochs:2,minibatchSize:32,seed:51});
 const scene=createScenario('corridor',43);
 let episodes=0,rewards=0;
 while(episodes<5){
  const result=ppoEpisode(trainer,scene,{maxSteps:80,trace:episodes===0});
  assert.ok(result.steps>0&&result.steps<=80);
  assert.ok(Number.isFinite(result.reward));
  if(episodes===0)assert.equal(result.trace.length,result.steps+1);
  episodes++;rewards+=result.reward;
  if(trainer.ready)trainer.optimize();
 }
 if(trainer.buffer.length)trainer.optimize();
 assert.ok(Number.isFinite(rewards));
 assert.ok(trainer.optimizations>=1);
 assert.ok(policy.updates>0);
 assert.ok(validatePpoPolicy(policy.serialize()));
 const corrupt=policy.serialize();corrupt.weights[0][0][0]=Infinity;
 const fresh=new PpoPolicy(3),before=fresh.serialize();
 assert.throws(()=>fresh.load(corrupt));
 assert.deepEqual(fresh.serialize(),before);
});
