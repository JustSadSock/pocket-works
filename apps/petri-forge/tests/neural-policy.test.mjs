import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTIONS} from '../lab-core.mjs';
import {NeuralActorCritic,encodeObservation,validateNeuralPolicy,NEURAL_SHAPE} from '../neural-policy.mjs';

const obs=(wall=0)=>({
 tiles:Array.from({length:7},(_,r)=>Array.from({length:7},(_,c)=>r===0||r===6||c===0||c===6?1:wall)),
 pos:[12,8],goalVec:[7,4]
});
test('observation vector represents each actual tile and goal direction',()=>{
 const vector=encodeObservation(obs());
 assert.equal(vector.length,249);
 assert.equal(vector[1],1); // the first tile is a wall
 assert.equal(vector[(3*7+3)*5],1); // centre tile is empty
 assert.ok(Math.abs(vector[247]-7/30)<1e-9);
 assert.throws(()=>encodeObservation({tiles:[]}),/7×7/);
});
test('gradient training changes weights, learns online, and survives serialization',()=>{
 const neural=new NeuralActorCritic(47),state=obs(),next=obs(4);
 const before=neural.serialize(),initial=neural.forward(state);
 assert.deepEqual(before.architecture,NEURAL_SHAPE);
 assert.equal(initial.probabilities.length,5);
 assert.ok(Math.abs(initial.probabilities.reduce((a,b)=>a+b,0)-1)<1e-9);
 for(let i=0;i<50;i++){
  const action=neural.act(state,true);
  assert.ok(ACTIONS.includes(action));
  neural.learn(state,action,1,next,i===49);
 }
 const after=neural.serialize();
 assert.equal(after.type,'neural-actor-critic');
 assert.equal(after.updates,50);
 assert.ok(validateNeuralPolicy(after));
 assert.notDeepEqual(after.weights,before.weights,'real gradient updates must alter weights');
 assert.ok(after.weights.every(layer=>layer.every(row=>row.every(Number.isFinite))));
 const restored=new NeuralActorCritic(12);restored.load(after);
 assert.deepEqual(restored.serialize(),after);
 assert.deepEqual(restored.forward(state).probabilities,neural.forward(state).probabilities);
 assert.ok(ACTIONS.includes(restored.act(state,false)));
});
test('brain validation rejects corrupt shapes and nonfinite weights before load',()=>{
 const brain=new NeuralActorCritic(1).serialize();
 for(const mutate of [
  b=>b.architecture[0]=1,
  b=>b.weights[0][0][2]=Infinity,
  b=>b.biases[2].pop(),
  b=>b.updates=-10,
  b=>b.type='qlearning'
 ]){
  const broken=structuredClone(brain);mutate(broken);
  assert.equal(validateNeuralPolicy(broken),false);
  const model=new NeuralActorCritic(4),original=model.serialize();
  assert.throws(()=>model.load(broken));
  assert.deepEqual(model.serialize(),original);
 }
});
