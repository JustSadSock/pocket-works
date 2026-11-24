import test from 'node:test';
import assert from 'node:assert/strict';
import { planShards,assertParity } from './sharding.mjs';
import { estimateHistory,adaptivePlan,predict } from './adaptive.mjs';
const tasks=Array.from({length:30},(_,i)=>({key:'app-suite-'+i,app:'app',suite:'suite',kind:i%2?'visual':'node-test',seed:null,install:false}));
const plan={tasks,shards:planShards(tasks,{maxTasks:6})};
const prior={schema:1,legacyJobs:30,shardJobs:plan.shards.length,legacyPassed:30,batchedPassed:29,issues:[],success:false,
 tasks:tasks.map((t,i)=>({key:t.key,baselinePassed:true,batchedPassed:i!==0,baselineDurationMs:1000+i*4000,batchedDurationMs:i===0?999999:1100+i*4000}))};
test('adaptive history ignores failed samples and accounts for enhanced build overhead',()=>{
 const h=estimateHistory(plan,prior,{enhancedApps:['app']});
 assert.equal(h.details[0].samples,1);assert.equal(h.details[0].buildMs,0);
 assert.equal(h.details[1].samples,2);assert.equal(h.details[1].buildMs,240000);
 assert.equal(h.details[0].testMs,1300);
});
test('adaptive plan preserves exact coverage and never selects slower predicted schedule',()=>{
 const r=adaptivePlan(plan,prior,{enhancedApps:['app']});
 assert.equal(r.measuredTasks,30);assert.equal(assertParity(tasks,r.shards),true);
 assert.ok(r.shards.every(s=>s.tasks.length<=6));
 assert.ok(r.adaptivePrediction.makespanMs<=r.baselinePrediction.makespanMs);
 assert.deepEqual(r,adaptivePlan(plan,prior,{enhancedApps:['app']}));
});
test('invalid duration samples use conservative fallback, invalid capacity rejected',()=>{
 const p={...prior,tasks:prior.tasks.map(r=>({...r,baselineDurationMs:-1,batchedDurationMs:NaN}))};
 assert.equal(estimateHistory(plan,p).details[0].testMs,60000);
 assert.throws(()=>predict(plan.shards,{cpuSlots:0}),/capacity/);
 assert.throws(()=>adaptivePlan(plan,{...prior,issues:['missing']}),/incomplete/);
});
