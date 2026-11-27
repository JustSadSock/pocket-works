import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {eligibleRuns,verifyDiscoveredCatalog,discover,discoveryTarget,verifyBundles,catalogArtifactPresent} from './gameplay-receipt-discovery.mjs';
import {buildCatalog,REPO,RENEWAL_WORKFLOW,APP_BRANCH} from './gameplay-renewal.mjs';
import {PLAN} from './verified-gameplay-receipt.mjs';
const now=Date.parse('2026-11-26T12:00:00Z'),source='a'.repeat(40),sourceTree='b'.repeat(40),issuer='c'.repeat(40),auditTree='d'.repeat(40),h='e'.repeat(64),flags={productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false},repo={full_name:REPO};
const run={id:42,run_attempt:1,path:RENEWAL_WORKFLOW,head_branch:'main',event:'schedule',repository:repo,head_repository:repo,status:'completed',conclusion:'success',head_sha:issuer,created_at:new Date(now-60000).toISOString()};
const ctx={source,sourceTree,sourceRef:APP_BRANCH,sourcePR:1355,auditCommit:issuer,auditTree,run:42,attempt:1,ref:'refs/heads/main',event:'schedule'};
const mount={schema:1,digest:h,files:10,directories:2,bytes:100,productionAuthorization:false,reuse:false};
const environment={contract:'banners-offline-phase-v1',image:'be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb',config:h,node:'v22.23.5',arch:'x64',toolchain:h,kernel:h,cpu:h,uid:1001,gid:1001};
const receipts=Array.from({length:8},(_,i)=>{const perf=[0,4,5,6,7].includes(i)?1:0;return {schema:1,kind:'renewable-banners-gameplay-v1',manifest:{schema:1,...ctx,shard:i,workflow:RENEWAL_WORKFLOW,repository:REPO,role:'source',sourceMount:mount,auditMount:mount,environment,productionAuthorization:false},planDigest:PLAN,gameplayCases:i<4?234:233,sourceMeasurements:[4,5].includes(i)?428:430,freshPerformanceCases:perf,freshPerformanceMeasurements:perf*2,gameplaySemanticDigest:h,gameplayRecordsDigest:h,gameplayPhaseDigest:h,performanceRecordsDigest:h,performancePhaseDigest:h,issuedAt:now-1000,...flags};});
const catalog=buildCatalog(receipts,ctx,now-500);
test('only trusted completed main renewal runs and exact requested source',()=>{
 assert.deepEqual(eligibleRuns([run,{...run,id:43,event:'pull_request'},{...run,id:44,conclusion:'failure'},{...run,id:45,head_repository:{full_name:'fork/repo'}},{...run,id:46,created_at:new Date(now-8*86400000).toISOString()}],now),[run]);
 const r=verifyDiscoveredCatalog(catalog,receipts,run,source,sourceTree,auditTree,now);
 assert.equal(r.authenticatedSubjects,9);assert.equal(r.allowResultReuse,false);
 assert.throws(()=>verifyDiscoveredCatalog(catalog,receipts,run,'f'.repeat(40),sourceTree,auditTree,now));
 assert.throws(()=>verifyDiscoveredCatalog(catalog,receipts,run,source,sourceTree,auditTree,catalog.expiresAt));
 assert.throws(()=>verifyDiscoveredCatalog(catalog,receipts.slice(1),run,source,sourceTree,auditTree,now));
 assert.throws(()=>verifyDiscoveredCatalog(catalog,[{...receipts[0],gameplayRecordsDigest:'f'.repeat(64)},...receipts.slice(1)],run,source,sourceTree,auditTree,now));
});
test('all nine signatures are checked; failure leaves no authenticated directory',()=>{
 for(const reject of [false,true]){
  const out=mkdtempSync(join(tmpdir(),'pw-discovery-'));let checks=0;
  try{
   const r=discover(source,issuer,out,{now,clock:()=>now,list:()=>[run],hasCatalog:()=>true,getTree:s=>s===source?sourceTree:auditTree,getRun:()=>run,download:(_,dir)=>{writeFileSync(join(dir,'catalog.json'),JSON.stringify(catalog));receipts.forEach((x,i)=>writeFileSync(join(dir,'receipt-'+i+'.json'),JSON.stringify(x)));},authenticate:()=>{checks++;if(reject&&checks===9)throw Error('signature rejected');},downloadBundles:()=>{},checkBundles:()=>{assert.equal(checks,9);}});
   assert.equal(checks,9);assert.equal(r.status,reject?'fresh-fallback':'authenticated-candidate');assert.equal(existsSync(join(out,'authenticated')),!reject);assert.equal(r.allowResultReuse,false);
  }finally{rmSync(out,{recursive:true,force:true});}
 }
});
test('discovery only for planned Banners work and approved branch',()=>{
 const staleMerge='f'.repeat(40),e={GITHUB_REPOSITORY:REPO,GITHUB_EVENT_NAME:'pull_request',GITHUB_REF:'refs/pull/1355/merge',QA_PR_NUMBER:'1355',QA_HEAD_REPO:REPO,QA_HEAD_REF:APP_BRANCH,QA_HEAD_SHA:source,QA_MERGE_SHA:staleMerge,QA_EXPECTED:'["banners-of-war-completion-lab-0"]'};
 assert.equal(discoveryTarget(e,issuer),issuer);
 assert.equal(discoveryTarget({...e,QA_MERGE_SHA:'e'.repeat(40)},issuer),issuer);
 assert.equal(discoveryTarget({...e,QA_MERGE_SHA:undefined},issuer),issuer);
 assert.equal(discoveryTarget({...e,QA_SOURCE_SHA:source,PW_QA_INTEGRATION_SOURCE:'1'},issuer),source);
 for(const p of [{QA_PR_NUMBER:'42'},{QA_HEAD_REPO:'fork/repo'},{QA_EXPECTED:'[]'},{QA_HEAD_REF:'other'},{GITHUB_REF:'refs/pull/1411/merge'},{QA_SOURCE_SHA:source}])assert.equal(discoveryTarget({...e,...p},issuer),null);
});

test('missing original bundles cannot be accepted',()=>{const root=mkdtempSync(join(tmpdir(),'pw-bundle-'));try{assert.throws(()=>verifyBundles(root,receipts,run));}finally{rmSync(root,{recursive:true,force:true});}});

test('scheduled no-ops cannot hide an authentic older catalog',()=>{
 const out=mkdtempSync(join(tmpdir(),'pw-discovery-lookback-'));let downloads=0,metadata=0,signatures=0;
 const noop=Array.from({length:24},(_,i)=>({...run,id:100+i,created_at:new Date(now-1000-i).toISOString()}));
 try{
  const r=discover(source,issuer,out,{now,clock:()=>now,list:()=>[{...run,id:999,head_sha:'f'.repeat(40),created_at:new Date(now-1).toISOString()},...noop,run],requiredIssuer:issuer,hasCatalog:x=>{metadata++;return x.id===run.id;},getTree:s=>s===source?sourceTree:auditTree,getRun:()=>run,download:(_,dir)=>{downloads++;writeFileSync(join(dir,'catalog.json'),JSON.stringify(catalog));receipts.forEach((x,i)=>writeFileSync(join(dir,'receipt-'+i+'.json'),JSON.stringify(x)));},authenticate:()=>{signatures++;},downloadBundles:()=>{},checkBundles:()=>{}});
  assert.equal(r.status,'authenticated-candidate');assert.equal(r.attempted,1);assert.equal(metadata,25);assert.equal(downloads,1);assert.equal(signatures,9);assert.deepEqual(r.lookupStats,{listed:26,issuerExcluded:1,metadataChecks:25,withoutCatalog:24,candidateDownloads:1});
 }finally{rmSync(out,{recursive:true,force:true});}
});
test('metadata is an exact current-attempt, unexpired artifact prefilter only',()=>{
 const a={id:1,name:'renewal-signed-catalog-1',expired:false,size_in_bytes:100};
 assert.equal(catalogArtifactPresent(run,[a]),true);
 for(const xs of [[],[a,a],[{...a,expired:true}],[{...a,name:'renewal-signed-catalog-2'}],[{...a,size_in_bytes:0}]])assert.equal(catalogArtifactPresent(run,xs),false);
});
test('only eight actual catalog candidates are downloaded, metadata failure is fail closed',()=>{
 for(const broken of [false,true]){
  const out=mkdtempSync(join(tmpdir(),'pw-discovery-budget-'));let downloads=0;
  const candidates=Array.from({length:12},(_,i)=>({...run,id:100+i}));
  try{
   const r=discover(source,issuer,out,{now,clock:()=>now,list:()=>candidates,hasCatalog:()=>{if(broken)throw Error('metadata API failed');return true;},getTree:()=>sourceTree,getRun:id=>candidates.find(x=>x.id===id),download:()=>{downloads++;throw Error('missing signed catalog');}});
   assert.equal(r.status,'fresh-fallback');assert.equal(downloads,broken?0:8);assert.equal(r.lookupStats.metadataChecks,broken?1:8);assert.equal(r.lookupStats.candidateDownloads,broken?0:8);assert.equal(r.allowResultReuse,false);assert.equal(existsSync(join(out,'authenticated')),false);
  }finally{rmSync(out,{recursive:true,force:true});}
 }
});
