import test from 'node:test';
import assert from 'node:assert/strict';
import {planShards} from './sharding.mjs';
import {selectLiveRetry,completeLive} from './live-shadow.mjs';
const tree='a'.repeat(40),tasks=['a','b'].map(app=>({key:app+'-test',app,suite:'test',kind:'node-test',seed:null,install:false}));
const plan={tasks,shards:planShards(tasks),prebuilt:[]};
const ok=t=>({schema:1,...t,success:true,exitCode:0,signal:null,timedOut:false});
test('live shadow keeps full coverage and only retries failed tasks',()=>{
 const first=[ok(tasks[0]),{...ok(tasks[1]),success:false}];
 const s=selectLiveRetry(plan,first,tree);
 assert.equal(s.shards.length,1);assert.equal(s.shards[0].tasks[0].key,tasks[1].key);
 const result=completeLive(plan,first,[ok(tasks[1])],tree);
 assert.equal(result.finalPassed,2);assert.equal(result.firstPass,1);assert.equal(result.recovered,1);
 assert.equal(result.productionAuthorization,false);assert.equal(result.legacyRequired,true);
 assert.throws(()=>completeLive(plan,first,[],tree),/retry coverage/);
});
test('missing evidence, mismatched task or retry budget block candidate',()=>{
 assert.throws(()=>selectLiveRetry(plan,[ok(tasks[0])],tree),/Incomplete/);
 assert.throws(()=>selectLiveRetry(plan,[ok(tasks[0]),{...ok(tasks[1]),seed:2}],tree),/identity/);
 assert.throws(()=>selectLiveRetry(plan,[ok(tasks[0]),{...ok(tasks[1]),success:false}],tree,0),/budget/);
});
