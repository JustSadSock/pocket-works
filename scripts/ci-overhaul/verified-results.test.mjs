import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { makeReceipt,verifyReceipt,taskDigest,policyDigest,environmentFingerprint } from './verified-results.mjs';
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const task={key:'sample-trial',app:'sample',suite:'trial',kind:'node-test',seed:null,install:false};
const policy={repository:'owner/repo',workflow:'.github/workflows/trusted-qa.yml',ref:'refs/heads/main',eligibleTaskDigests:[taskDigest(task)]};
const env={imageDigest:'1'.repeat(64),toolchainDigest:'2'.repeat(64),externalInputsDigest:'3'.repeat(64),os:'linux',arch:'x64',node:'v22.12.0'};
const context={tree:'a'.repeat(40),environment:environmentFingerprint(env),policyDigest:policyDigest(policy),task};
const source={repository:policy.repository,workflow:policy.workflow,ref:policy.ref,headSha:'b'.repeat(40),runId:12,attempt:1};
const now=1_800_000_000_000;
const result={schema:1,...task,success:true,exitCode:0,signal:null,timedOut:false,durationMs:5};
const evidence=Buffer.from(JSON.stringify(result));
const receipt=makeReceipt({context,policy,source,evidence,privateKey,now});
const check=(extra={})=>verifyReceipt({receipt,context,policy,evidence,publicKey,now,...extra});
test('exact signed successful evidence can be reused',()=>assert.equal(check().reuse,true));
test('any code tree or environment change invalidates reuse',()=>{
  assert.equal(check({context:{...context,tree:'c'.repeat(40)}}).reuse,false);
  assert.equal(check({context:{...context,environment:environmentFingerprint({...env,node:'v22.13.0'})}}).reuse,false);
});
test('unapproved task, altered policy and task seed fail closed',()=>{
  assert.equal(check({policy:{...policy,eligibleTaskDigests:[]}}).reuse,false);
  assert.equal(check({context:{...context,task:{...task,seed:2}}}).reuse,false);
  assert.equal(check({policy:{...policy,ref:'refs/heads/feature'}}).reuse,false);
});
test('tampered payload or untrusted signer rejected',()=>{
  assert.equal(check({receipt:{...receipt,payload:{...receipt.payload,issuedAt:now-1}}}).reuse,false);
  assert.equal(check({publicKey:generateKeyPairSync('ed25519').publicKey}).reuse,false);
  assert.equal(check({receipt:{...receipt,signature:'bad'}}).reuse,false);
});
test('expired, future and excessive TTL fail closed',()=>{
  assert.equal(check({now:now+8*86400000}).reuse,false);
  assert.equal(check({now:now-1}).reuse,false);
  assert.equal(check({maxAgeMs:8*86400000}).reuse,false);
});
test('changed, missing, failed or timed out result is rejected',()=>{
  for(const value of [
    {...result,durationMs:6},{...result,success:false},{...result,timedOut:true},{...result,exitCode:1},
    {...result,key:'other'}, {...result,signal:'SIGTERM'}
  ])assert.equal(check({evidence:Buffer.from(JSON.stringify(value))}).reuse,false);
  assert.equal(check({evidence:Buffer.alloc(0)}).reuse,false);
});
test('protected issuer must reject failure and untrusted source',()=>{
  assert.throws(()=>makeReceipt({context,policy,source:{...source,ref:'refs/heads/pr'},evidence,privateKey,now}),/provenance/);
  assert.throws(()=>makeReceipt({context,policy,source,evidence:Buffer.from(JSON.stringify({...result,success:false})),privateKey,now}),/successful/);
});
test('unknown runner identity cannot create cache keys',()=>{
  assert.throws(()=>environmentFingerprint({...env,imageDigest:'ubuntu-latest'}),/pinned/);
  assert.throws(()=>environmentFingerprint({...env,node:'22'}),/pinned/);
  assert.throws(()=>environmentFingerprint({...env,externalInputsDigest:undefined}),/pinned/);
});
