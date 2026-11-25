// Called only after the main-only controller has independently authenticated
// both attestations with gh. This module never authorizes delivery or reuse.
import {execFileSync} from 'node:child_process';
import {readFileSync,appendFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {TASK,REPO,WORKFLOW,compareShadowReceipt} from './attested-shadow.mjs';
import {compareInputs} from './verified-input-impact.mjs';
const SHA=/^[0-9a-f]{40}$/;
const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();

export function checkRun(root,run,bundle,now){
 const {source,environment,evidence,receipt}=bundle;
 if(!run||run.repository?.full_name!==REPO||run.head_repository?.full_name!==REPO||
    run.path!==WORKFLOW||run.head_branch!=='main'||run.status!=='completed'||run.conclusion!=='success'||
    !['push','workflow_dispatch'].includes(run.event)||!SHA.test(run.head_sha??'')||
    !Number.isSafeInteger(run.id)||!Number.isSafeInteger(run.run_attempt)||
    source?.commit!==run.head_sha||source?.run!==run.id||source?.attempt!==run.run_attempt||
    source?.event!==run.event||source?.tree!==git(root,['rev-parse',run.head_sha+'^{tree}']))
   throw Error('Receipt does not match independently selected successful main run');
 const result=compareShadowReceipt({receipt,source,environment,evidence,now});
 if(!result.match)throw Error('Invalid receipt: '+result.reason);
 return receipt;
}

export function comparePair(root,priorRun,currentRun,prior,current,now=Date.now()){
 const p=checkRun(root,priorRun,prior,now),c=checkRun(root,currentRun,current,now);
 if(priorRun.id===currentRun.id||p.source.commit===c.source.commit||
   p.issuedAt>c.issuedAt)throw Error('Need two distinct chronological commits');
 git(root,['merge-base','--is-ancestor',p.source.commit,c.source.commit]);
 const input=compareInputs(root,p.source.commit,c.source.commit,TASK);
 const environmentMatch=p.environmentFingerprint===c.environmentFingerprint;
 return {schema:1,mode:'authenticated-pair-shadow',priorRun:priorRun.id,currentRun:currentRun.id,
   priorCommit:p.source.commit,currentCommit:c.source.commit,inputMatch:input.inputMatch,
   environmentMatch,changedScopedPaths:input.changedScopedPaths??[],
   inputReason:input.reason,observedPriorMs:JSON.parse(prior.evidence.toString('utf8')).durationMs,
   observedCurrentMs:JSON.parse(current.evidence.toString('utf8')).durationMs,
   potentialMatch:input.inputMatch&&environmentMatch,
   decision:'execute',reuse:false,canSkip:false,productionAuthorization:false};
}

const json=p=>JSON.parse(readFileSync(p,'utf8'));
const bundle=dir=>({source:json(join(dir,'source.json')),environment:json(join(dir,'environment.json')),
 evidence:readFileSync(join(dir,'evidence.json')),receipt:json(join(dir,'receipt.json'))});
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [priorMeta,currentMeta,priorDir,currentDir]=process.argv.slice(2);
  const report=comparePair(process.cwd(),json(priorMeta),json(currentMeta),bundle(priorDir),bundle(currentDir));
  const output=JSON.stringify(report,null,2);
  console.log(output);
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
   '## Authenticated receipt pair (advisory only)\n\n~~~json\n'+output+'\n~~~\n');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
