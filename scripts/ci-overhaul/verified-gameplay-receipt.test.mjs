import test from 'node:test';import assert from 'node:assert/strict';
import {summarizeGameplayComparison,decide,validateManifest,validatePhase,SOURCE,SOURCE_TREE,PLAN,WORKFLOW,REPLAY_WORKFLOW} from './verified-gameplay-receipt.mjs';
import {createHash} from 'node:crypto';
const h='a'.repeat(64),mount={schema:1,digest:h,files:20,directories:4,bytes:1000,productionAuthorization:false,reuse:false};
const s={schema:1,shard:0,repository:'JustSadSock/pocket-works',workflow:WORKFLOW,role:'source',source:SOURCE,sourceTree:SOURCE_TREE,auditCommit:'b'.repeat(40),auditTree:'c'.repeat(40),run:12,attempt:1,ref:'refs/heads/main',event:'push',sourceMount:mount,auditMount:mount,environment:{contract:'banners-offline-phase-v1',image:'be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb',arch:'x64',node:'v22.12.0',config:h,cpu:h,kernel:h,toolchain:h,uid:1001,gid:1001},productionAuthorization:false};
const r={schema:2,kind:'banners-gameplay-shadow-v2',manifest:s,planDigest:PLAN,shard:0,gameplayCases:234,gameplaySemanticDigest:h,gameplayRecordsDigest:h,gameplayPhaseDigest:h,sourceMeasurements:430,issuedAt:100,productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
const t={...s,role:'trial'};
test('strict same-run admission only in non-authoritative trial',()=>{const d=decide(r,t,101);assert.equal(d.decision,'reuse-shadow');assert.equal(d.productionAuthorization,false);});
test('any provenance, mount, environment or freshness mismatch executes',()=>{for(const x of [{...t,run:13},{...t,attempt:2},{...t,auditTree:'d'.repeat(40)},{...t,sourceMount:{...mount,digest:'b'.repeat(64)}},{...t,environment:{...t.environment,kernel:'b'.repeat(64)}},{...t,environment:{...t.environment,extra:'unknown'}}])assert.equal(decide(r,x,101).decision,'execute');assert.equal(decide(r,t,100+8*86400000).decision,'execute');assert.throws(()=>validateManifest({...s,ref:'refs/pull/1/merge',event:'pull_request'},'source'));assert.equal(decide({...r,gameplayCases:233},t,101).decision,'execute');});
test('fresh performance rejects wrong scenario, omitted metrics and missing coverage',()=>{const entry={index:1872,id:h,kind:'performance',value:150},p={shards:[{performance:[entry]}]},records=[{index:entry.index,id:h,kind:'performance',version:'chronicles-completion-v1',result:{units:150,seconds:4,plannerMs:1,physicsMs:2,snapshotChars:30}}];const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;const report={schema:1,source:SOURCE,run:s.run,attempt:s.attempt,auditCommit:s.auditCommit,shard:0,phase:'performance',planDigest:PLAN,version:'chronicles-completion-v1',expected:1,completed:1,productionAuthorization:false,recordDigest:createHash('sha256').update(JSON.stringify(stable(records))).digest('hex')};assert.equal(validatePhase(p,'performance',report,records,s).measurements,2);assert.throws(()=>validatePhase(p,'performance',report,[],s));assert.throws(()=>validatePhase(p,'performance',report,[{...records[0],result:{...records[0].result,units:26}}],s));});

test('completed trusted upstream permits a distinct exact-commit replay only',()=>{
 const u={id:s.run,run_attempt:s.attempt,repository:{full_name:s.repository},head_repository:{full_name:s.repository},path:WORKFLOW,head_branch:'main',head_sha:s.auditCommit,event:s.event,status:'completed',conclusion:'success'};
 const target={...t,workflow:REPLAY_WORKFLOW,role:'replay',event:'workflow_run',run:14,upstreamRun:s.run,upstreamAttempt:s.attempt};
 assert.equal(decide(r,target,101,u).decision,'reuse-shadow');
 for(const bad of [{...u,conclusion:'failure'},{...u,status:'in_progress'},{...u,run_attempt:2},{...u,head_sha:'d'.repeat(40)},{...u,head_repository:{full_name:'fork/repo'}},{...u,path:REPLAY_WORKFLOW},{...u,event:'pull_request'}])assert.equal(decide(r,target,101,bad).decision,'execute');
 for(const bad of [{...target,run:s.run},{...target,upstreamAttempt:2},{...target,auditCommit:'d'.repeat(40)},{...target,environment:{...target.environment,cpu:'b'.repeat(64)}},{...target,auditMount:{...mount,digest:'b'.repeat(64)}}])assert.equal(decide(r,bad,101,u).decision,'execute');
 assert.equal(decide(r,target,101).decision,'execute');
});

test('receipt admission does not claim a freshly observed semantic match',()=>{
 const d=decide(r,t,101),x=summarizeGameplayComparison(r,d,null);
 assert.equal(x.semanticMatch,null);assert.equal(x.semanticComparison,'not-executed');
 assert.equal(x.freshGameplayCases,0);assert.equal(x.reusedGameplayCases,234);
 assert.equal(x.freshGameplayMeasurements,0);assert.equal(x.historicalGameplayMeasurements,430);
 assert.equal(x.freshGameplaySemanticDigest,null);
 assert.throws(()=>summarizeGameplayComparison(r,d,{cases:234,measurements:430,semanticDigest:h}));
 assert.throws(()=>summarizeGameplayComparison(r,{...d,gameplaySemanticDigest:'b'.repeat(64)},null));
});
test('fresh comparison distinguishes matching, mismatching and missing evidence',()=>{
 const d={decision:'execute',productionAuthorization:false},g={cases:234,measurements:430,semanticDigest:h};
 const x=summarizeGameplayComparison(r,d,g);
 assert.equal(x.semanticMatch,true);assert.equal(x.semanticComparison,'match');
 assert.equal(x.freshGameplayCases,234);assert.equal(x.reusedGameplayCases,0);
 assert.equal(x.freshGameplayMeasurements,430);assert.equal(x.freshGameplaySemanticDigest,h);
 const y=summarizeGameplayComparison(r,d,{...g,semanticDigest:'b'.repeat(64)});
 assert.equal(y.semanticMatch,false);assert.equal(y.semanticComparison,'mismatch');
 for(const bad of [null,{...g,cases:233},{...g,measurements:429},{...g,semanticDigest:'bad'}])assert.throws(()=>summarizeGameplayComparison(r,d,bad));
 assert.throws(()=>summarizeGameplayComparison(r,{decision:'unknown',productionAuthorization:false},g));
 assert.throws(()=>summarizeGameplayComparison(r,{...d,productionAuthorization:true},g));
});

test('shard identity cannot be substituted, and zero-performance shards are valid',()=>{
 const m={...s,shard:1},receipt={...r,manifest:m,shard:1},target={...m,role:'trial'};
 assert.equal(decide(receipt,target,101).decision,'reuse-shadow');
 assert.equal(decide(receipt,t,101).decision,'execute');
 assert.equal(decide({...receipt,shard:0},target,101).decision,'execute');
 const p={shards:[{}, {performance:[]}]},records=[];
 const report={schema:1,source:SOURCE,run:m.run,attempt:m.attempt,auditCommit:m.auditCommit,shard:1,phase:'performance',planDigest:PLAN,version:'chronicles-completion-v1',expected:0,completed:0,productionAuthorization:false,recordDigest:createHash('sha256').update('[]').digest('hex')};
 assert.deepEqual(validatePhase(p,'performance',report,records,m).performance,[]);
 assert.throws(()=>validatePhase(p,'performance',{...report,shard:0},records,m));
 assert.throws(()=>validatePhase(p,'performance',report,[{}],m));
});
