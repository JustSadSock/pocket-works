// Tests admission branches against the real audited plan and signed input.
// These constructed targets are test fixtures, not new runner observations.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {decideAdmission,validatePolicyEvidence} from './gameplay-admission-policy.mjs';
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const root=process.env.ADMISSION_EVIDENCE,target=process.env.ADMISSION_TARGET;
test('pinned evidence admits only the observed directed pair and mandatory canary remains fresh',()=>{
 const receipt=load(join(root,'receipt.json')),upstream=load(join(root,'upstream.json')),probe=validatePolicyEvidence(load(join(root,'probe.json')),load(join(root,'probe-run.json')),load(join(root,'pr.json')));
 const m=load(join(target,'manifest.json')),p=load(join(target,'plan.json')),shard=m.shard;
 const ctx={shard,run:m.run,attempt:m.attempt,commit:'a'.repeat(40),ref:m.ref};
 const now=receipt.issuedAt+1000;
 const targetFor=(environment,run)=>{
  const manifest={...m,run,environment},plan={...p,context:{...p.context,run}};
  return [manifest,plan,{...ctx,run}];
 };
 const nonCanary=ctx.run+(shard===(ctx.run+ctx.attempt)%8?1:0),canary=ctx.run+(shard-(ctx.run+ctx.attempt)%8+8)%8;
 const row=probe.perShard[shard];
 const check=(env,run,rec=receipt,evidence=probe,at=now)=>{
  const [manifest,plan,c]=targetFor(env,run);
  return decideAdmission(rec,manifest,plan,evidence,upstream,c,at);
 };
 assert.equal(check(row.targetEnvironment,nonCanary).decision,'reuse-shadow');
 assert.equal(check(row.targetEnvironment,nonCanary).eligibility,row.category==='exact'?'exact':'observed-directed-pair');
 assert.equal(check(row.targetEnvironment,canary).reason,'Mandatory rotating canary');
 assert.equal(check({...row.targetEnvironment,cpu:'f'.repeat(64)},nonCanary).decision,'execute');
 assert.equal(check({...row.targetEnvironment,toolchain:'f'.repeat(64)},nonCanary).decision,'execute');
 assert.equal(check(row.targetEnvironment,nonCanary,receipt,null).decision,'execute');
 assert.equal(check(row.targetEnvironment,nonCanary,receipt,probe,receipt.issuedAt+7*86400000+1).decision,'execute');
 assert.equal(check(row.targetEnvironment,nonCanary,{...receipt,shard:(shard+1)%8}).decision,'execute');
});
