import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {taskDigest,digest,environmentFingerprint} from './verified-results.mjs';
import {assessSource,issueProtected} from './protected-issuer.mjs';
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const task={key:'example-test',app:'example',suite:'test',kind:'node-test',seed:null,install:false};
const td=taskDigest(task),sha='a'.repeat(40),tree='b'.repeat(40);
const environment={imageDigest:'1'.repeat(64),toolchainDigest:'2'.repeat(64),externalInputsDigest:'3'.repeat(64),os:'linux',arch:'x64',node:'v22.12.0'};
const policy={enabled:true,repository:'owner/repo',workflow:'.github/workflows/hermetic.yml',workflowId:7,ref:'refs/heads/main',issuerEnvironment:'verified-results-signer',eligibleTaskDigests:[td],environmentFingerprint:environmentFingerprint(environment),publicKeyDigest:digest(publicKey.export({type:'spki',format:'der'}))};
const evidence=Buffer.from(JSON.stringify({schema:1,...task,success:true,exitCode:0,signal:null,timedOut:false}));
const archiveBytes=Buffer.from('synthetic archive fixture');
const sourceMetadata={task,policy,environment,issuer:{ref:policy.ref,refProtected:true,environment:policy.issuerEnvironment},
 run:{id:123,run_attempt:1,workflow_id:7,path:policy.workflow,head_branch:'main',event:'push',status:'completed',conclusion:'success',head_sha:sha,repository:{full_name:policy.repository},head_repository:{full_name:policy.repository}},
 job:{run_id:123,run_attempt:1,head_sha:sha,status:'completed',conclusion:'success',name:'hermetic-'+td},
 artifact:{workflow_run:{id:123,head_sha:sha},name:'hermetic-'+td+'-attempt-1',expired:false,digest:'sha256:'+digest(archiveBytes)},
 commit:{sha,tree:{sha:tree}}};
const issue=overrides=>issueProtected({sourceMetadata,archiveBytes,evidence,extractEvidence:()=>evidence,privateKey,now:1800000000000,...overrides});
test('dedicated protected metadata can issue a signed receipt in a synthetic fixture',()=>{
 assert.equal(assessSource(sourceMetadata).allowed,true);
 assert.equal(issue({}).payload.tree,tree);
});
test('reject unprotected ref, disabled policy, fork, wrong workflow, failed run, wrong tree and mutable environment',()=>{
 for(const patch of [
  {issuer:{...sourceMetadata.issuer,refProtected:false}},
  {policy:{...policy,enabled:false}},{policy:{...policy,eligibleTaskDigests:[]}},
  {run:{...sourceMetadata.run,head_repository:{full_name:'fork/repo'}}},
  {run:{...sourceMetadata.run,workflow_id:8}},{run:{...sourceMetadata.run,event:'pull_request'}},
  {run:{...sourceMetadata.run,conclusion:'failure'}},{commit:{...sourceMetadata.commit,sha:tree}},
  {environment:{...environment,imageDigest:'latest'}},
  {job:{...sourceMetadata.job,run_attempt:2}},{artifact:{...sourceMetadata.artifact,expired:true}},
  {artifact:{...sourceMetadata.artifact,name:'generic'}}
 ])assert.equal(assessSource({...sourceMetadata,...patch}).allowed,false,JSON.stringify(patch));
});
test('receipt issuer binds evidence to artifact digest and pinned key',()=>{
 assert.throws(()=>issue({archiveBytes:Buffer.from('tampered')}),/archive digest/);
 assert.throws(()=>issue({extractEvidence:()=>Buffer.from('tampered')}),/authenticated archive/);
 assert.throws(()=>issue({privateKey:generateKeyPairSync('ed25519').privateKey}),/key not pinned/);
 assert.throws(()=>issue({extractEvidence:null}),/decoder/);
});
