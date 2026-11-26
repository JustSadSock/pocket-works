import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyMixed,eligibleDelivery} from './gameplay-production-delivery.mjs';
import {taskDigest} from './verified-results.mjs';
const sha='a'.repeat(40),tree='b'.repeat(40),controller='c'.repeat(40),flags={productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
const t={key:'banners-of-war-completion-lab-0',app:'banners-of-war',suite:'completion-lab',kind:'node',seed:0,install:false},u={key:'banners-of-war-regression',app:'banners-of-war',suite:'regression',kind:'node-test',seed:null,install:false};
const raw='cpu_matrix='+JSON.stringify({include:[t,u]})+'\nbrowser_matrix={"include":[]}\nexpected='+JSON.stringify([t.key,u.key])+'\n';
const ctx={enabled:true,source:sha,tree,run:10,attempt:1};
const fresh=x=>({schema:1,...x,success:true,exitCode:0,signal:null,timedOut:false});
const hit={schema:1,mode:'production-verified-gameplay-v1',task:t,taskDigest:taskDigest(t),run:10,attempt:1,source:sha,tree};
const proof={schema:1,independentlyVerified:true,run:10,attempt:1,source:sha,sourceTree:tree,controller,shard:0,reusedGameplayCases:234,freshGameplayCases:0,freshPerformanceCases:1,identity:'exact-tree-merge',...flags};
const read=x=>x===t||x.key===t.key?{hit}:{fresh:fresh(u)};
test('mixed gate independently verifies one hit and retains original fresh task',()=>{
 let calls=0;const r=verifyMixed(raw,ctx,read,()=>{calls++;return proof;});assert.equal(calls,1);assert.equal(r.expected,2);assert.equal(r.verifiedTasks,1);assert.equal(r.reusedGameplayCases,234);assert.equal(r.productionAuthorization,true);
 const f=verifyMixed(raw,ctx,x=>({fresh:fresh(x)}),()=>{throw Error('Unexpected audit');});assert.equal(f.verifiedTasks,0);assert.equal(f.productionAuthorization,false);
});
test('gate fails closed on missing, ambiguous, changed, shadow, canary or forged evidence',()=>{
 for(const p of [{...proof,independentlyVerified:false},{...proof,run:11},{...proof,sourceTree:sha},{...proof,freshPerformanceCases:0},{...proof,reusedGameplayCases:233},{...proof,allowImpactSkipping:true}])assert.throws(()=>verifyMixed(raw,ctx,read,()=>p));
 assert.throws(()=>verifyMixed(raw,{...ctx,enabled:false},read,()=>proof));
 for(const p of [{},{hit:{...hit,tree:sha}},{hit,fresh:fresh(t)},{fresh:{...fresh(t),verificationMode:'verified-split-shadow'}}])assert.throws(()=>verifyMixed(raw,ctx,x=>x.key===t.key?p:{fresh:fresh(u)},()=>proof));
 const canary={...ctx,run:7};assert.throws(()=>verifyMixed(raw,canary,x=>x.key===t.key?{hit:{...hit,run:7}}:{fresh:fresh(u)},()=>({...proof,run:7})));
});
test('production route is explicitly scoped to approved same-repository PR',()=>{
 const e={GITHUB_REPOSITORY:'JustSadSock/pocket-works',GITHUB_EVENT_NAME:'pull_request',GITHUB_REF:'refs/pull/1355/merge',QA_PR_NUMBER:'1355',QA_HEAD_REPO:'JustSadSock/pocket-works',QA_HEAD_REF:'app/banners-of-war',PW_QA_PRODUCTION_VERIFIED:'1'};
 assert.equal(eligibleDelivery(e),true);for(const x of [{PW_QA_PRODUCTION_VERIFIED:'0'},{QA_PR_NUMBER:'1411'},{GITHUB_REF:'refs/heads/main'},{QA_HEAD_REPO:'other/repo'}])assert.equal(eligibleDelivery({...e,...x}),false);
});
