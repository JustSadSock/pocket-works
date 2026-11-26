import test from 'node:test';
import assert from 'node:assert/strict';
import {decideRenewable} from './gameplay-renewable-admission.mjs';
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
