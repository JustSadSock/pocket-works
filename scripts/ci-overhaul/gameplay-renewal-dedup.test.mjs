import test from 'node:test';
import assert from 'node:assert/strict';
import {renewalDecision,checkRenewal} from './gameplay-renewal-dedup.mjs';
import {PLAN} from './verified-gameplay-receipt.mjs';
const now=Date.parse('2026-11-27T02:00:00Z'),DAY=86400000,source='a'.repeat(40),sourceTree='b'.repeat(40),sha='c'.repeat(40),tree='d'.repeat(40);
const flags={productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
const identity={source,sourceTree,sourcePR:1355,sourceRef:'refs/pull/1355/merge'},controller={sha,tree};
const report={schema:1,status:'authenticated-candidate',source,sourceTree,issuer:sha,issuerTree:tree,checkout:sha,sourceRun:42,sourceAttempt:2,expiresAt:now+7*DAY-1000,planDigest:PLAN,authenticatedSubjects:9,verifiedBundles:8,shards:8,compatibility:'pinned-runtime-gameplay-v1',...flags};
test('a fresh exact catalog suppresses only duplicate issuance, without new authorization',()=>{
 const r=renewalDecision(identity,controller,report,now);
 assert.equal(r.renewalRequired,false);assert.equal(r.existingRun,42);assert.equal(r.existingAttempt,2);assert.equal(r.expiresAt,report.expiresAt);assert.equal(r.productionAuthorization,false);assert.equal(r.allowResultReuse,false);
});
test('identity drift, unsigned or incomplete evidence, invalid freshness all renew',()=>{
 for(const r of [null,{...report,status:'fresh-fallback'},{...report,authenticatedSubjects:8},{...report,verifiedBundles:7},{...report,shards:7},{...report,sourceTree:sha},{...report,issuer:source},{...report,issuerTree:sourceTree},{...report,checkout:source},{...report,planDigest:'bad'},{...report,compatibility:'exact-environment-only'},{...report,allowResultReuse:true},{...report,sourceRun:0},{...report,sourceAttempt:0},{...report,expiresAt:now+6*DAY-1},{...report,expiresAt:now+7*DAY+1},{...report,expiresAt:now}])assert.equal(renewalDecision(identity,controller,r,now).renewalRequired,true);
 assert.equal(renewalDecision({...identity,source:sha},controller,report,now).renewalRequired,true);
 assert.equal(renewalDecision(identity,{...controller,tree:sourceTree},report,now).renewalRequired,true);
 assert.equal(renewalDecision(identity,controller,report,now+DAY).renewalRequired,true);
});
test('lookup authenticates the exact requested source; exceptions require renewal',()=>{
 const r=checkRenewal(identity,controller,'/unused',{clock:()=>now,lookup:(s,c,o)=>{assert.equal(s,source);assert.equal(c,sha);assert.equal(o,'/unused');return report;}});
 assert.equal(r.renewalRequired,false);
 assert.equal(checkRenewal(identity,controller,'/unused',{clock:()=>now,lookup:()=>{throw Error('API unavailable');}}).renewalRequired,true);
});
