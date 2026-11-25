// Main-only independent reuse trial. No output can satisfy the production gate.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {TASK,REPO,WORKFLOW} from './attested-shadow.mjs';
import {canonical,environmentFingerprint,taskDigest} from './verified-results.mjs';
import {checkRun} from './verified-cross-commit.mjs';
import {compareInputs} from './verified-input-impact.mjs';
import {verdict} from './canary-evidence.mjs';
const sha=/^[0-9a-f]{40}$/;
export const REPLAY_WORKFLOW='.github/workflows/verified-reuse-replay.yml';
const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const fallback=reason=>({schema:1,decision:'execute',reason,productionAuthorization:false});
export function admitTrial(root,priorRun,bundle,target,environment,now=Date.now()){
 try{
  const p=checkRun(root,priorRun,bundle,now);
  const regular=target?.workflow===WORKFLOW&&['push','workflow_dispatch'].includes(target.event);
  const replay=target?.workflow===REPLAY_WORKFLOW&&target.event==='workflow_run'&&
    target.upstreamRun===p.source.run&&target.upstreamAttempt===p.source.attempt&&target.commit===p.source.commit;
  if(target?.repository!==REPO||(!regular&&!replay)||target.ref!=='refs/heads/main'||!sha.test(target.commit??'')||
     !sha.test(target.tree??'')||!Number.isSafeInteger(target.run)||target.run<1||
     !Number.isSafeInteger(target.attempt)||target.attempt<1||
     target.run===p.source.run||target.commit!==git(root,['rev-parse','HEAD'])||
     target.tree!==git(root,['rev-parse','HEAD^{tree}']))throw Error('Invalid independent target');
  git(root,['merge-base','--is-ancestor',p.source.commit,target.commit]);
  if(p.environment.contract!=='readonly-offline-container-v2'||environment?.contract!=='readonly-offline-container-v2')
   throw Error('Missing v2 mounted evidence');
  if(!target.mountedInputs||canonical(target.mountedInputs)!==canonical(p.source.mountedInputs))
   throw Error('Actual mounted inputs differ');
  if(environmentFingerprint(environment)!==p.environmentFingerprint)throw Error('Execution environment differs');
  if(!compareInputs(root,p.source.commit,target.commit,TASK).inputMatch)throw Error('Scoped inputs differ');
  return {schema:1,decision:'reuse-trial',task:TASK,taskDigest:taskDigest(TASK),
   sourceRun:p.source.run,sourceAttempt:p.source.attempt,sourceCommit:p.source.commit,
   targetRun:target.run,targetAttempt:target.attempt,targetCommit:target.commit,targetTree:target.tree,
   evidenceDigest:p.evidenceDigest,environmentFingerprint:p.environmentFingerprint,mountedDigest:p.source.mountedInputs.digest,
   productionAuthorization:false};
 }catch(e){return fallback(e.message);}
}
export function parity(trial,fresh,tree,run,attempt,commit){
 const v=verdict([TASK],[fresh],tree);
 if(!v.success||trial?.schema!==1||trial.productionAuthorization!==false||
    trial.admission?.productionAuthorization!==false)throw Error('Incomplete fresh or trial evidence');
 if(trial.mode==='historical-trial'){
  const a=trial.admission;
  if(trial.executed!==false||Object.hasOwn(trial,'result')||a.decision!=='reuse-trial'||
    a.taskDigest!==taskDigest(TASK)||canonical(a.task)!==canonical(TASK)||
    a.targetTree!==tree||a.targetCommit!==commit||a.targetRun!==run||a.targetAttempt!==attempt||
    a.sourceRun===run||!Number.isSafeInteger(a.sourceRun)||a.sourceRun<1||
    ![a.evidenceDigest,a.environmentFingerprint,a.mountedDigest].every(x=>/^[0-9a-f]{64}$/.test(x??'')))
     throw Error('Invalid historical trial accounting');
 }else if(trial.mode==='fresh-trial'){
  if(trial.executed!==true||trial.admission.decision!=='execute'||!verdict([TASK],[trial.result],tree).success)
   throw Error('Invalid fresh fallback accounting');
 }else throw Error('Unknown trial mode');
 return {schema:1,task:TASK.key,originalPlanDigest:v.planDigest,originalExpected:1,
  freshPassed:1,trialCoverage:1,trialExecuted:trial.executed,trialReused:trial.mode==='historical-trial',
  productionAuthorization:false,deliveryPolicyChanged:false};
}
const json=p=>JSON.parse(readFileSync(p,'utf8'));
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,...a]=process.argv.slice(2),root=process.cwd();
  if(mode==='parity'){
   const r=parity(json(a[0]),json(a[1]),git(root,['rev-parse','HEAD^{tree}']),Number(process.env.GITHUB_RUN_ID),Number(process.env.GITHUB_RUN_ATTEMPT),git(root,['rev-parse','HEAD']));
   const s=JSON.stringify(r,null,2);console.log(s);
   if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## Independent trial accounting\n\n~~~json\n'+s+'\n~~~\n');
  }else{
   const [dir,target,environment,out]=a;
   const bundle={source:json(join(dir,'source.json')),environment:json(join(dir,'environment.json')),evidence:readFileSync(join(dir,'evidence.json')),receipt:json(join(dir,'receipt.json'))};
   const r=admitTrial(root,json(mode),bundle,json(target),json(environment));
   writeFileSync(out,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));
  }
 }catch(e){console.error(e.message);process.exitCode=1;}
}
