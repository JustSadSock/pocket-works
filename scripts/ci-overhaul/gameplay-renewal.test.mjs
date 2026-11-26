import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCandidate,buildCatalog,catalogCandidate,RENEWAL_WORKFLOW,REPO,APP_BRANCH} from './gameplay-renewal.mjs';
import {PLAN} from './verified-gameplay-receipt.mjs';
const sha='a'.repeat(40),tree='b'.repeat(40),controller='c'.repeat(40),auditTree='d'.repeat(40),h='e'.repeat(64),repo={full_name:REPO};
const pr={number:1355,state:'open',merged:false,head:{sha,ref:APP_BRANCH,repo},base:{ref:'main',repo}};
test('only exact approved app PR or merged main is selected',()=>{
 assert.deepEqual(resolveCandidate(pr,controller,controller),{source:sha,sourceRef:APP_BRANCH,sourcePR:1355});
 assert.equal(resolveCandidate({...pr,state:'closed',merged:true,merge_commit_sha:sha},controller,controller).source,controller);
 for(const p of [{...pr,number:1},{...pr,head:{...pr.head,repo:{full_name:'other/repo'}}},{...pr,head:{...pr.head,ref:'other'}},{...pr,state:'closed'}])assert.throws(()=>resolveCandidate(p,controller,controller));
});
const ctx={source:sha,sourceTree:tree,sourceRef:APP_BRANCH,sourcePR:1355,auditCommit:controller,auditTree,run:42,attempt:1,ref:'refs/heads/main',event:'schedule'};
const mount={schema:1,digest:h,files:10,directories:2,bytes:100,productionAuthorization:false,reuse:false};
const environment={contract:'banners-offline-phase-v1',image:'be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb',config:h,node:'v22.23.5',arch:'x64',toolchain:h,kernel:h,cpu:h,uid:1001,gid:1001};
const rows=()=>Array.from({length:8},(_,i)=>{const perf=[0,4,5,6,7].includes(i)?1:0;return {schema:1,kind:'renewable-banners-gameplay-v1',manifest:{schema:1,...ctx,shard:i,workflow:RENEWAL_WORKFLOW,repository:REPO,role:'source',sourceMount:mount,auditMount:mount,environment,productionAuthorization:false},planDigest:PLAN,gameplayCases:i<4?234:233,sourceMeasurements:[4,5].includes(i)?428:430,freshPerformanceCases:perf,freshPerformanceMeasurements:perf*2,gameplaySemanticDigest:h,gameplayRecordsDigest:h,gameplayPhaseDigest:h,performanceRecordsDigest:h,performancePhaseDigest:h,issuedAt:1000,productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};});
test('complete renewable catalog never authorizes production or inherits portability',()=>{
 const c=buildCatalog(rows(),ctx,2000);assert.equal(c.gameplayCases,1868);assert.equal(c.freshPerformanceCases,5);assert.equal(c.productionAuthorization,false);
 const target={...ctx,shard:0,planDigest:PLAN,sourceMount:mount,auditMount:mount,environment};
 assert.equal(catalogCandidate(c,target,2001).decision,'candidate-only');
 for(const t of [{...target,source:'f'.repeat(40)},{...target,environment:{...environment,kernel:'f'.repeat(64)}},{...target,sourceMount:{...mount,digest:'f'.repeat(64)}}])assert.equal(catalogCandidate(c,t,2001).decision,'execute');
 assert.equal(catalogCandidate(c,target,c.expiresAt+1).decision,'execute');
 for(const mutate of [r=>r.pop(),r=>{r[1].manifest.shard=0},r=>{r[1].manifest.source='f'.repeat(40)},r=>{r[4].freshPerformanceCases=0},r=>{r[1].productionAuthorization=true}]){const r=rows();mutate(r);assert.throws(()=>buildCatalog(r,ctx,2000));}
});
