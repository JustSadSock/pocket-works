import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRuns,jobSeconds,summarizeTimings,auditShard} from './gameplay-evidence-audit.mjs';
import {WORKFLOW,REPLAY_WORKFLOW,SOURCE,SOURCE_TREE,PLAN} from './verified-gameplay-receipt.mjs';
const repo={full_name:'JustSadSock/pocket-works'},common={repository:repo,head_repository:repo,head_branch:'main',head_sha:'a'.repeat(40),status:'completed',conclusion:'success',run_attempt:1};
const source={...common,id:12,path:WORKFLOW,event:'push',updated_at:'2026-01-01T00:00:00Z'},replay={...common,id:13,path:REPLAY_WORKFLOW,event:'workflow_run',created_at:'2026-01-01T00:01:00Z'};
test('requires two successful distinct exact-commit trusted runs in order',()=>{
 assert.equal(validateRuns(source,replay),source.head_sha);
 for(const r of [{...replay,id:12},{...replay,head_sha:'b'.repeat(40)},{...replay,head_repository:{full_name:'fork/repo'}},{...replay,conclusion:'failure'},{...replay,event:'pull_request'},{...replay,created_at:'2025-12-31T00:00:00Z'}])assert.throws(()=>validateRuns(source,r));
});
const job={name:'execute (0)',run_attempt:1,status:'completed',conclusion:'success',started_at:'2026-01-01T00:00:00Z',completed_at:'2026-01-01T00:01:00Z'};
test('rejects incomplete, duplicate, failed or wrong-attempt job evidence',()=>{
 assert.equal(jobSeconds({total_count:1,jobs:[job]},[job.name],1)[job.name],60);
 for(const p of [{total_count:2,jobs:[job]},{total_count:2,jobs:[job,job]},{total_count:1,jobs:[{...job,run_attempt:2}]},{total_count:1,jobs:[{...job,conclusion:'failure'}]},{total_count:1,jobs:[{...job,completed_at:null}]}])assert.throws(()=>jobSeconds(p,[job.name],1));
});
test('reports observed job duration and hits without claiming savings',()=>{
 const jobs={},replayJobs={},perShard=Array.from({length:8},(_,i)=>{jobs['execute ('+i+')']=60;jobs['trial ('+i+')']=20;replayJobs['replay ('+i+')']=30;return {decision:i%2===0?'reuse-shadow':'execute'};});
 const r=summarizeTimings(jobs,replayJobs,{perShard},{perShard});
 assert.equal(r.sourceJobSeconds,480);assert.equal(r.trialJobSeconds,160);assert.equal(r.replayJobSeconds,240);assert.equal(r.replayHitShards,4);assert.match(r.scope,/not net CI savings/);
 delete replayJobs['replay (0)'];assert.throws(()=>summarizeTimings(jobs,replayJobs,{perShard},{perShard}));
});

test('each replay must reference the same authenticated source shard',()=>{
 const h='c'.repeat(64),tree='d'.repeat(40),mount={schema:1,digest:h,files:20,directories:4,bytes:1000,productionAuthorization:false,reuse:false};
 const manifest={schema:1,shard:0,repository:repo.full_name,workflow:WORKFLOW,role:'source',source:SOURCE,sourceTree:SOURCE_TREE,auditCommit:source.head_sha,auditTree:tree,run:source.id,attempt:source.run_attempt,ref:'refs/heads/main',event:'push',sourceMount:mount,auditMount:mount,environment:{contract:'banners-offline-phase-v1',image:'be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb',arch:'x64',node:'v22.12.0',config:h,cpu:h,kernel:h,toolchain:h,uid:1001,gid:1001},productionAuthorization:false};
 const receipt={schema:2,shard:0,manifest,planDigest:PLAN,gameplayCases:234,gameplaySemanticDigest:h,gameplayRecordsDigest:h,sourceMeasurements:430,productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
 const row={shard:0,auditTree:tree,sourceGameplaySemanticDigest:h,historicalGameplayMeasurements:430,gameplayCases:234,gameplayReused:true,admission:{gameplayRecordsDigest:h}};
 assert.equal(auditShard(receipt,source,row,row,0),tree);
 for(const r of [{...row,shard:1},{...row,auditTree:'e'.repeat(40)},{...row,sourceGameplaySemanticDigest:'e'.repeat(64)},{...row,historicalGameplayMeasurements:428},{...row,admission:{gameplayRecordsDigest:'e'.repeat(64)}}])assert.throws(()=>auditShard(receipt,source,row,r,0));
 assert.throws(()=>auditShard({...receipt,manifest:{...manifest,attempt:2}},source,row,row,0));
});
