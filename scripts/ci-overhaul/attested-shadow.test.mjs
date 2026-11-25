import test from 'node:test';
import assert from 'node:assert/strict';
import {TASK,REPO,WORKFLOW,makeShadowReceipt,compareShadowReceipt} from './attested-shadow.mjs';
const source={repository:REPO,workflow:WORKFLOW,ref:'refs/heads/main',commit:'a'.repeat(40),tree:'b'.repeat(40),run:123,attempt:1,event:'push'};
const environment={contract:'readonly-offline-container-v1',imageDigest:'1'.repeat(64),toolchainDigest:'2'.repeat(64),externalInputsDigest:'3'.repeat(64),containerConfigDigest:'4'.repeat(64),kernelDigest:'5'.repeat(64),executionContractDigest:'6'.repeat(64),os:'linux',arch:'x64',node:'v22.12.0'};
const now=1800000000000;
const result={schema:1,...TASK,success:true,exitCode:0,signal:null,timedOut:false,durationMs:42};
const bytes=r=>Buffer.from(JSON.stringify(r));
const evidence=bytes(result);
const receipt=makeShadowReceipt({source,environment,evidence,now});
const compare=(extra={})=>compareShadowReceipt({receipt,source,environment,evidence,now,...extra});
test('exact successful evidence matches but never authorizes skipping',()=>{
 assert.deepEqual(compare(),{match:true,productionAuthorization:false,reuse:false});
 assert.equal(receipt.allowResultReuse,false);
 assert.equal(receipt.allowImpactSkipping,false);
});
test('rejects non-main and unrelated runs or incomplete environment',()=>{
 for(const s of [{...source,ref:'refs/pull/42/merge'},{...source,event:'pull_request'},{...source,repository:'other/repo'},{...source,workflow:'other.yml'},{...source,attempt:0}])
 assert.throws(()=>makeShadowReceipt({source:s,environment,evidence,now}),/Untrusted/);
 assert.throws(()=>makeShadowReceipt({source,environment:{...environment,imageDigest:'latest'},evidence,now}),/pinned/);
 assert.throws(()=>makeShadowReceipt({source,environment:{...environment,kernelDigest:''},evidence,now}),/Incomplete/);
});
test('rejects changed source, runtime, evidence, freshness, and authorization flags',()=>{
 for(const extra of [{source:{...source,tree:'c'.repeat(40)}},{source:{...source,run:124}},{environment:{...environment,kernelDigest:'9'.repeat(64)}},{evidence:bytes({...result,durationMs:43})},{now:now+8*86400000},{now:now-1},{receipt:{...receipt,allowResultReuse:true}}])
 assert.equal(compare(extra).match,false);
});
test('never issues successful receipts for failed, cancelled, missing or different tasks',()=>{
 for(const r of [{...result,success:false},{...result,exitCode:1},{...result,signal:'SIGTERM'},{...result,timedOut:true},{...result,key:'other'},{...result,durationMs:-1}])
 assert.throws(()=>makeShadowReceipt({source,environment,evidence:bytes(r),now}),/evidence/);
 assert.throws(()=>makeShadowReceipt({source,environment,evidence:Buffer.alloc(0),now}),/evidence/);
});
