import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {TASK,REPO,WORKFLOW,makeShadowReceipt} from './attested-shadow.mjs';
import {comparePair} from './verified-cross-commit.mjs';
const now=1800000000000;
const environment={contract:'readonly-offline-container-v2',imageDigest:'1'.repeat(64),toolchainDigest:'2'.repeat(64),externalInputsDigest:'3'.repeat(64),containerConfigDigest:'4'.repeat(64),kernelDigest:'5'.repeat(64),executionContractDigest:'6'.repeat(64),os:'linux',arch:'x64',node:'v22.12.0'};
const evidence=Buffer.from(JSON.stringify({schema:1,...TASK,success:true,exitCode:0,signal:null,timedOut:false,durationMs:42}));
function fixture(fn){
 const root=mkdtempSync(join(tmpdir(),'pw-receipt-pair-'));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 const put=(p,v)=>{const file=join(root,p);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,v);};
 const commit=()=>{git('add','-A');git('-c','user.name=QA','-c','user.email=qa@example.invalid','commit','-qm','fixture');return git('rev-parse','HEAD');};
 const pair=(sha,id,env=environment,mountDigest='8'.repeat(64))=>{
   const run={id,run_attempt:1,repository:{full_name:REPO},head_repository:{full_name:REPO},path:WORKFLOW,head_branch:'main',status:'completed',conclusion:'success',event:'push',head_sha:sha};
   const source={repository:REPO,workflow:WORKFLOW,ref:'refs/heads/main',commit:sha,tree:git('rev-parse',sha+'^{tree}'),run:id,attempt:1,event:'push',...(env.contract==='readonly-offline-container-v2'?{mountedInputs:{schema:1,digest:mountDigest,files:6,directories:4,bytes:42,productionAuthorization:false,reuse:false}}:{})};
   return {run,bundle:{source,environment:env,evidence,receipt:makeShadowReceipt({source,environment:env,evidence,now:now-100+id})}};
 };
 try{
  git('init','-q');
  for(const p of ['apps/axis-pals/qa.plan.json','apps/axis-pals/test.mjs','apps/other/app.js','shared/math.mjs','scripts/universal-qa/run.mjs','package.json','package-lock.json',WORKFLOW])put(p,'initial');
  const first=pair(commit(),1);put('apps/other/app.js','unrelated');const second=pair(commit(),2);
  fn({root,first,second,put,commit,pair});
 }finally{rmSync(root,{recursive:true,force:true});}
}
const compare=(root,p,c)=>comparePair(root,p.run,c.run,p.bundle,c.bundle,now);
test('distinct trusted-source fixtures with unchanged inputs match only in shadow',()=>fixture(({root,first,second})=>{
 const r=compare(root,first,second);assert.equal(r.potentialMatch,true);assert.equal(r.environmentMatch,true);
 assert.equal(r.reuse,false);assert.equal(r.canSkip,false);assert.equal(r.productionAuthorization,false);
}));
test('modified visible file and environment invalidate potential match',()=>fixture(({root,first,second,put,commit,pair})=>{
 const e=pair(second.run.head_sha,3,{...environment,kernelDigest:'7'.repeat(64)});
 assert.equal(compare(root,first,e).environmentMatch,false);
 put('shared/math.mjs','changed');const c=pair(commit(),4);
 const r=compare(root,first,c);assert.equal(r.potentialMatch,false);assert.ok(r.changedScopedPaths.includes('shared/math.mjs'));
}));
test('rejects false run metadata, tampered evidence, duplicate commit and non-main source',()=>fixture(({root,first,second})=>{
 for(const run of [{...second.run,conclusion:'failure'},{...second.run,run_attempt:2},{...second.run,head_branch:'feature'},{...second.run,id:99}])
  assert.throws(()=>compare(root,first,{...second,run}),/independently selected/);
 assert.throws(()=>compare(root,first,{...second,bundle:{...second.bundle,evidence:Buffer.from('{}')}}),/Invalid receipt/);
 assert.throws(()=>compare(root,first,first),/distinct/);
}));

test('legacy receipts or different actual mount digests cannot be potential matches',()=>fixture(({root,first,second,pair})=>{
 const older=pair(first.run.head_sha,1,{...environment,contract:'readonly-offline-container-v1'});
 const r=compare(root,older,second);assert.equal(r.mountedProofs,false);assert.equal(r.potentialMatch,false);
 const changed=pair(second.run.head_sha,3,environment,'9'.repeat(64));
 const x=compare(root,first,changed);assert.equal(x.inputMatch,true);assert.equal(x.environmentMatch,true);assert.equal(x.mountedMatch,false);assert.equal(x.potentialMatch,false);
}));
