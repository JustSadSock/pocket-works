import test from 'node:test';
import assert from 'node:assert/strict';
import { planShards } from './sharding.mjs';
import { selectRetry,reconcile } from './selective-retry.mjs';
const tasks=['a','b','c'].map(app=>({key:app+'-visual',app,suite:'visual',kind:'visual',seed:null,install:false}));
const plan={tasks,shards:planShards(tasks)};
const prior={schema:1,legacyJobs:3,shardJobs:plan.shards.length,legacyPassed:3,batchedPassed:2,issues:[],success:false,tasks:tasks.map((t,i)=>({key:t.key,baselinePassed:true,batchedPassed:i!==1}))};
const evidence={schema:1,...tasks[1],success:true,exitCode:0,signal:null,timedOut:false};
test('only failed tasks are selected and first attempt remains visible',()=>{
 const r=selectRetry(plan,prior);assert.deepEqual(r.failed,[tasks[1]]);assert.equal(r.shards.length,1);
 const final=reconcile(plan,prior,[evidence]);assert.equal(final.finalPassed,3);assert.equal(final.firstPass,2);assert.equal(final.recovered,1);assert.equal(final.success,true);assert.equal(final.retry[0].firstAttemptPassed,false);
});
test('retry cannot mask failure, timeout, mismatched seed or identity',()=>{
 for(const patch of [{success:false},{timedOut:true},{seed:1},{suite:'other'},{exitCode:1}]){
  const r=reconcile(plan,prior,[{...evidence,...patch}]);assert.equal(r.success,false);assert.equal(r.finalPassed,2);
 }
 assert.throws(()=>reconcile(plan,prior,[]),/Incomplete/);
 assert.throws(()=>reconcile(plan,prior,[{...evidence,key:tasks[0].key}]),/Unexpected/);
});
test('incomplete, inconsistent or structurally invalid historical audit is rejected',()=>{
 for(const patch of [{issues:['missing']},{legacyPassed:2},{batchedPassed:3},{success:true},{tasks:[prior.tasks[0],prior.tasks[0],prior.tasks[2]]},{tasks:prior.tasks.slice(0,2)}])
  assert.throws(()=>selectRetry(plan,{...prior,...patch}));
});
test('no retry if all prior tasks passed',()=>{
 const clean={...prior,batchedPassed:3,success:true,tasks:prior.tasks.map(t=>({...t,batchedPassed:true}))};
 assert.equal(selectRetry(plan,clean).failed.length,0);
 assert.equal(reconcile(plan,clean,[]).success,true);
});
