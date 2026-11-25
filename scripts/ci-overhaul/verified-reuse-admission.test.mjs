import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {TASK,REPO,WORKFLOW,makeShadowReceipt} from './attested-shadow.mjs';
import {admitTrial,parity} from './verified-reuse-admission.mjs';
const now=1800000000000;
const environment={contract:'readonly-offline-container-v2',imageDigest:'1'.repeat(64),toolchainDigest:'2'.repeat(64),externalInputsDigest:'3'.repeat(64),containerConfigDigest:'4'.repeat(64),kernelDigest:'5'.repeat(64),executionContractDigest:'6'.repeat(64),os:'linux',arch:'x64',node:'v22.12.0'};
const mountedInputs={schema:1,digest:'8'.repeat(64),files:6,directories:4,bytes:42,productionAuthorization:false,reuse:false};
const result={schema:1,...TASK,success:true,exitCode:0,signal:null,timedOut:false,durationMs:42},evidence=Buffer.from(JSON.stringify(result));
function fixture(fn){
 const root=mkdtempSync(join(tmpdir(),'pw-reuse-admission-'));
 const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
 const put=(p,v)=>{const file=join(root,p);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,v);};
 const commit=()=>{git('add','-A');git('-c','user.name=QA','-c','user.email=qa@example.invalid','commit','-qm','fixture');return git('rev-parse','HEAD');};
 const source=(sha,run)=>({repository:REPO,workflow:WORKFLOW,ref:'refs/heads/main',commit:sha,tree:git('rev-parse',sha+'^{tree}'),run,attempt:1,event:'push',mountedInputs});
 try{
  git('init','-q');
  for(const p of ['apps/axis-pals/qa.plan.json','apps/axis-pals/test.mjs','shared/math.mjs','scripts/universal-qa/run.mjs','package.json','package-lock.json',WORKFLOW])put(p,'initial');
  const old=source(commit(),1),run={id:1,run_attempt:1,repository:{full_name:REPO},head_repository:{full_name:REPO},path:WORKFLOW,head_branch:'main',status:'completed',conclusion:'success',event:'push',head_sha:old.commit};
  const bundle={source:old,environment,evidence,receipt:makeShadowReceipt({source:old,environment,evidence,now:now-1000})};
  put('docs/other.md','unrelated');const target=source(commit(),2);
  fn({root,run,bundle,target,put,commit,source});
 }finally{rmSync(root,{recursive:true,force:true});}
}
test('authentic-context fixture admits unchanged scope and exact-tree reruns only as trial',()=>fixture(({root,run,bundle,target})=>{
 const a=admitTrial(root,run,bundle,target,environment,now);
 assert.equal(a.decision,'reuse-trial');assert.equal(a.productionAuthorization,false);
 const t={schema:1,mode:'historical-trial',executed:false,admission:a,productionAuthorization:false};
 assert.equal(parity(t,result,target.tree,2,1,target.commit).trialReused,true);
 assert.throws(()=>parity({...t,result},result,target.tree,2,1,target.commit),/historical/);
 assert.throws(()=>parity(t,{...result,success:false},target.tree,2,1,target.commit),/Incomplete/);
 assert.throws(()=>parity(t,result,target.tree,3,1,target.commit),/historical/);
}));
test('rejects old, failed, changed mount, env, scope, target, source or evidence',()=>fixture(({root,run,bundle,target,put,commit,source})=>{
 const check=(r=run,b=bundle,t=target,e=environment,n=now)=>admitTrial(root,r,b,t,e,n);
 for(const x of [check({...run,conclusion:'failure'}),check(run,{...bundle,evidence:Buffer.from('{}')}),check(run,bundle,{...target,run:1}),check(run,bundle,{...target,mountedInputs:{...mountedInputs,digest:'9'.repeat(64)}}),check(run,bundle,target,{...environment,kernelDigest:'9'.repeat(64)}),check(run,bundle,target,environment,now+8*86400000),check(run,bundle,{...target,ref:'refs/heads/feature'})])assert.equal(x.decision,'execute');
 put('shared/math.mjs','changed');assert.equal(check(run,bundle,source(commit(),3)).decision,'execute');
}));
test('fresh fallback requires successful original evidence',()=>fixture(({target})=>{
 const t={schema:1,mode:'fresh-trial',executed:true,admission:{decision:'execute',productionAuthorization:false},result,productionAuthorization:false};
 assert.equal(parity(t,result,target.tree,2,1,target.commit).trialReused,false);
 assert.throws(()=>parity({...t,result:{...result,exitCode:1}},result,target.tree,2,1,target.commit),/fallback/);
}));
