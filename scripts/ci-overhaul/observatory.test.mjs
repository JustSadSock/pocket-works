import test from 'node:test';
import assert from 'node:assert/strict';
import { planShards } from './sharding.mjs';
import { coverage,observe,summarizeRun,markdown } from './observatory.mjs';
const tasks=['a','b'].map(app=>({key:app+'-visual',app,suite:'visual',kind:'visual',seed:null,install:false}));
const plan={tasks,shards:planShards(tasks)};
const prior={schema:1,legacyJobs:2,shardJobs:1,legacyPassed:2,batchedPassed:1,issues:[],success:false,tasks:tasks.map((t,i)=>({key:t.key,baselinePassed:true,batchedPassed:i===0}))};
const retry={schema:1,expected:2,firstPass:1,recovered:1,finalPassed:2,firstAttemptFailures:[tasks[1].key],retry:[{key:tasks[1].key,firstAttemptPassed:false,retryPassed:true,attempts:2}],success:true};
const start='2026-01-01T00:00:00Z',end='2026-01-01T00:01:00Z';
const fixture=(id,n,conclusion)=>({run:{id,status:'completed',conclusion,run_started_at:start,updated_at:end},jobs:Array.from({length:n},(_,i)=>({id:id*100+i,conclusion:'success',started_at:start,completed_at:end}))});
test('coverage retains original failure and counts recovered tasks exactly',()=>{
 assert.deepEqual(coverage(plan,prior,retry),{expected:2,firstPass:1,recovered:1,finalPassed:2,unresolved:0,firstAttemptFailures:['b-visual'],cleanFirstPass:false});
 assert.throws(()=>coverage(plan,prior,{...retry,recovered:2}),/inconsistent/);
 assert.throws(()=>coverage(plan,prior,{...retry,firstAttemptFailures:['a-visual']}),/identity/);
});
test('runner duration and wall duration remain separate',()=>{
 const r=summarizeRun(fixture(1,3,'success').run,fixture(1,3,'success').jobs);
 assert.equal(r.wallMs,60000);assert.equal(r.runnerMs,180000);
 const f=fixture(1,3,'success');f.jobs[0].started_at=null;assert.equal(summarizeRun(f.run,f.jobs).runnerMs,null);
 assert.throws(()=>summarizeRun(f.run,[f.jobs[0],f.jobs[0]]),/Incomplete/);
});
test('observation cannot authorize migration, even with recovered full coverage',()=>{
 const runs={legacy:fixture(1,4,'success'),shadow:fixture(2,3,'failure'),retry:fixture(3,1,'success')};
 const r=observe({plan,prior,retry,runs});
 assert.equal(r.comparison.taskJobsReduction,.5);assert.equal(r.comparison.actualCombinedRunnerMs,240000);
 assert.equal(r.migration.ready,false);assert.match(markdown(r),/BLOCKED/);
 assert.throws(()=>observe({plan,prior,retry,runs:{...runs,shadow:fixture(2,2,'failure')}}),/conflicts/);
});
