import test from 'node:test';
import assert from 'node:assert/strict';
import {TASK} from './attested-shadow.mjs';
import {taskDigest} from './verified-results.mjs';
import {summarize} from './verified-replay-summary.mjs';
const sha='1'.repeat(40),tree='2'.repeat(40),fingerprint='3'.repeat(64);
const ctx={sourceRun:1,sourceAttempt:1,sha,tree,run:2,attempt:1};
const hit={schema:1,mode:'historical-replay',executed:false,productionAuthorization:false,admission:{decision:'reuse-trial',task:TASK,taskDigest:taskDigest(TASK),sourceRun:1,sourceAttempt:1,sourceCommit:sha,targetCommit:sha,targetTree:tree,targetRun:2,targetAttempt:1,evidenceDigest:'4'.repeat(64),environmentFingerprint:fingerprint,mountedDigest:'5'.repeat(64),environmentComparison:{match:true,changedFields:[],priorFingerprint:fingerprint,currentFingerprint:fingerprint},productionAuthorization:false}};
const miss={schema:1,mode:'fresh-replay',executed:true,productionAuthorization:false,admission:{decision:'execute',reason:'Execution environment differs',environmentComparison:{match:false,changedFields:['kernelDigest']},productionAuthorization:false},result:{schema:1,...TASK,success:true,exitCode:0,signal:null,timedOut:false}};
test('reports real hit and fallback without authorizing delivery',()=>{const r=summarize([hit,miss],ctx);assert.equal(r.strictHits,1);assert.equal(r.freshExecutions,1);assert.equal(r.productionAuthorization,false);assert.deepEqual(r.replicas[1].changedFields,['kernelDigest']);});
test('zero hits is an explicit valid experiment, not proof of reuse',()=>{assert.equal(summarize([miss,miss],ctx).strictHits,0);});
test('rejects missing, forged or failed records',()=>{
 for(const rows of [[hit],[hit,{...hit,executed:true}],[hit,{...hit,admission:{...hit.admission,sourceRun:9}}],[hit,{...miss,result:{...miss.result,success:false}}]])
  assert.throws(()=>summarize(rows,ctx));
});
