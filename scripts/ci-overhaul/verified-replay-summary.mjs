// Bounded two-replica experiment, not a delivery verdict.
import {readFileSync,readdirSync,lstatSync,appendFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {TASK} from './attested-shadow.mjs';
import {canonical,taskDigest} from './verified-results.mjs';
import {verdict} from './canary-evidence.mjs';
export function summarize(rows,{sourceRun,sourceAttempt,sha,tree,run,attempt}){
 if(![sourceRun,sourceAttempt,run,attempt].every(x=>Number.isSafeInteger(x)&&x>0)||sourceRun===run||
  ![sha,tree].every(x=>/^[a-f0-9]{40}$/.test(x??''))||!Array.isArray(rows)||rows.length!==2)
  throw Error('Invalid replay coverage or context');
 const replicas=rows.map((r,i)=>{
  if(r?.schema!==1||r.productionAuthorization!==false||r.admission?.productionAuthorization!==false)throw Error('Invalid replay record');
  const a=r.admission;
  if(r.mode==='historical-replay'){
   if(r.executed!==false||Object.hasOwn(r,'result')||a.decision!=='reuse-trial'||a.taskDigest!==taskDigest(TASK)||canonical(a.task)!==canonical(TASK)||
     a.sourceRun!==sourceRun||a.sourceAttempt!==sourceAttempt||a.sourceCommit!==sha||a.targetCommit!==sha||a.targetTree!==tree||
     a.targetRun!==run||a.targetAttempt!==attempt||a.environmentComparison?.match!==true||
     a.environmentComparison.changedFields?.length!==0||a.environmentComparison.priorFingerprint!==a.environmentFingerprint||
     a.environmentComparison.currentFingerprint!==a.environmentFingerprint||
     ![a.evidenceDigest,a.environmentFingerprint,a.mountedDigest].every(x=>/^[a-f0-9]{64}$/.test(x??'')))
    throw Error('Historical provenance or accounting mismatch');
   return {replica:i+1,reused:true,changedFields:[]};
  }
  if(r.mode!=='fresh-replay'||r.executed!==true||a.decision!=='execute'||!verdict([TASK],[r.result],tree).success)
   throw Error('Fresh replay did not pass');
  if(a.environmentComparison&&(a.environmentComparison.match!==false||!Array.isArray(a.environmentComparison.changedFields)||!a.environmentComparison.changedFields.length))
   throw Error('Invalid environment mismatch diagnostics');
  return {replica:i+1,reused:false,reason:a.reason,changedFields:a.environmentComparison?.changedFields??[]};
 });
 return {schema:1,sourceRun,sourceAttempt,sha,replicas,strictHits:replicas.filter(r=>r.reused).length,
  freshExecutions:replicas.filter(r=>!r.reused).length,productionAuthorization:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.env.MATRIX_RESULT!=='success')throw Error('Incomplete replay matrix');
  const {execFileSync}=await import('node:child_process');
  const tree=execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),root=process.argv[2],attempt=Number(process.env.GITHUB_RUN_ATTEMPT);
  const expected=[1,2].map(n=>'verified-replay-'+attempt+'-'+n);
  if(JSON.stringify(readdirSync(root).sort())!==JSON.stringify(expected))throw Error('Missing or unexpected replay artifacts');
  const rows=expected.map(d=>{
   const dir=join(root,d),file=join(dir,'replay.json');
   if(!lstatSync(dir).isDirectory()||JSON.stringify(readdirSync(dir))!==JSON.stringify(['replay.json'])||!lstatSync(file).isFile()||lstatSync(file).size>2_000_000)throw Error('Invalid artifact');
   return JSON.parse(readFileSync(file,'utf8'));
  });
  const report=summarize(rows,{sourceRun:Number(process.env.UPSTREAM_RUN),sourceAttempt:Number(process.env.UPSTREAM_ATTEMPT),sha:process.env.UPSTREAM_SHA,tree,run:Number(process.env.GITHUB_RUN_ID),attempt});
  const output=JSON.stringify(report,null,2);console.log(output);
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## Strict environment replay experiment\n\n~~~json\n'+output+'\n~~~\n');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
