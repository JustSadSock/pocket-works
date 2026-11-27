import test from 'node:test';
import assert from 'node:assert/strict';
import {decideRenewable,proveMergeEquivalence} from './gameplay-renewable-admission.mjs';
import {buildCatalog,REPO,RENEWAL_WORKFLOW,APP_BRANCH} from './gameplay-renewal.mjs';
import {PLAN,validatePlan} from './verified-gameplay-receipt.mjs';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const h='e'.repeat(64),source='a'.repeat(40),tree='b'.repeat(40),controller='c'.repeat(40),auditTree='d'.repeat(40);
test('missing or forged execution context cannot admit',()=>{
 const ctx={run:1,attempt:1,checkout:source,controller,shard:0,ref:'refs/pull/1/merge',event:'pull_request'};
 for(const target of [{},{source:'f'.repeat(40),run:1,attempt:1,shard:0},{source,run:1,attempt:1,shard:0,auditCommit:controller,ref:ctx.ref,event:ctx.event}])assert.equal(decideRenewable(null,null,target,null,ctx).decision,'execute');
});
if(process.env.RENEWABLE_ADMISSION_FIXTURE)test('real signed catalog and actual plan: exact, changed source, mounts, environment, expiry, canary',()=>{
 const root=process.env.RENEWABLE_ADMISSION_FIXTURE,read=p=>JSON.parse(readFileSync(p,'utf8')),c=read(join(root,'catalog.json')),shard=0,r=read(join(root,'receipt-0.json')),original=read(join(root,'bundles','renewal-bundle-'+c.attempt+'-0','plan.json'));
 const now=c.issuedAt+1,ctx={run:10,attempt:1,checkout:c.source,controller:c.auditCommit,shard,ref:'refs/pull/1/merge',event:'pull_request'};
 const target={...r.manifest,run:ctx.run,attempt:ctx.attempt,ref:ctx.ref,event:ctx.event};
 const plan={...original,context:{...original.context,run:ctx.run,attempt:ctx.attempt}};
 assert.equal(decideRenewable(c,r,target,plan,ctx,now).decision,'reuse-shadow');
 for(const [t,p,x,at] of [[{...target,sourceTree:'f'.repeat(40)},plan,ctx,now],[{...target,environment:{...target.environment,kernel:'f'.repeat(64)}},plan,ctx,now],[{...target,sourceMount:{...target.sourceMount,digest:'f'.repeat(64)}},plan,ctx,now],[target,plan,{...ctx,checkout:'f'.repeat(40)},now],[target,plan,ctx,c.expiresAt+1]])assert.equal(decideRenewable(c,r,t,p,x,at).decision,'execute');
 const canary={...ctx,run:7};assert.equal(decideRenewable(c,r,{...target,run:7},{...plan,context:{...plan.context,run:7}},canary,now).reason,'Mandatory rotating fresh canary');
 assert.equal(decideRenewable(c,{...r,gameplayRecordsDigest:'f'.repeat(64)},target,plan,ctx,now).decision,'execute');
 assert.equal(decideRenewable(null,null,target,plan,ctx,now).reason,'No authenticated evidence');
});

test('only the actual approved two-parent merge with identical full tree is equivalent',()=>{
 const merge='f'.repeat(40),base='1'.repeat(40),c={source,sourceTree:tree,sourceRef:APP_BRANCH,sourcePR:1355},target={source:merge,sourceTree:tree},repo={full_name:REPO};
 const pr={number:1355,state:'open',mergeable:true,head:{repo,ref:APP_BRANCH,sha:source},base:{repo,ref:'main',sha:base},merge_commit_sha:merge},commit={sha:merge,tree:{sha:tree},parents:[{sha:base},{sha:source}]};
 assert.deepEqual(proveMergeEquivalence(c,target,pr,commit),{source,checkout:merge,tree,base,pr:1355});
 for(const [p,k] of [[{...pr,mergeable:false},commit],[{...pr,number:42},commit],[{...pr,merge_commit_sha:source},commit],[pr,{...commit,tree:{sha:source}}],[pr,{...commit,parents:[{sha:source},{sha:base}]}]])assert.equal(proveMergeEquivalence(c,target,p,k),null);
});
if(process.env.RENEWABLE_ADMISSION_FIXTURE)test('real signed plan admits proven tree-equivalent merge and rejects other commits',()=>{
 const root=process.env.RENEWABLE_ADMISSION_FIXTURE,read=p=>JSON.parse(readFileSync(p,'utf8')),c=read(join(root,'catalog.json')),r=read(join(root,'receipt-0.json')),original=read(join(root,'bundles','renewal-bundle-'+c.attempt+'-0','plan.json'));
 const checkout='f'.repeat(40),base='1'.repeat(40),ctx={run:10,attempt:1,checkout,controller:c.auditCommit,shard:0,ref:'refs/pull/1/merge',event:'pull_request'};
 const target={...r.manifest,source:checkout,run:ctx.run,attempt:ctx.attempt,ref:ctx.ref,event:ctx.event},plan={...original,context:{...original.context,source:checkout,run:ctx.run,attempt:ctx.attempt}},now=c.issuedAt+1;
 const equivalence={source:c.source,checkout,tree:c.sourceTree,base,pr:1355};
 assert.equal(decideRenewable(c,r,target,plan,ctx,now).decision,'execute');
 assert.equal(decideRenewable(c,r,target,plan,{...ctx,equivalence},now).identity,'exact-tree-merge');
 assert.equal(decideRenewable(c,r,{...target,sourceTree:base},plan,{...ctx,equivalence},now).decision,'execute');
});
