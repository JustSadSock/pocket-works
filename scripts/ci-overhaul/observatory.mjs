// CI Observatory: report actual evidence and separate estimates from measurements.
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectRetry } from './selective-retry.mjs';

const ms=(a,b)=>{const start=Date.parse(a),end=Date.parse(b);return Number.isFinite(start)&&Number.isFinite(end)&&end>=start?end-start:null;};
export function summarizeRun(run,jobs){
 if(!run||run.status!=='completed'||!Array.isArray(jobs)||!jobs.length||new Set(jobs.map(j=>j.id)).size!==jobs.length)throw Error('Incomplete run metadata');
 const durations=jobs.map(j=>ms(j.started_at,j.completed_at));
 const wallMs=ms(run.run_started_at,run.updated_at);
 const conclusions={};
 for(const j of jobs)conclusions[j.conclusion??'unknown']=(conclusions[j.conclusion??'unknown']??0)+1;
 return {id:run.id,conclusion:run.conclusion,jobs:jobs.length,conclusions,wallMs,
   runnerMs:durations.every(x=>x!==null)?durations.reduce((a,b)=>a+b,0):null,
   measuredJobs:durations.filter(x=>x!==null).length};
}
export function coverage(plan,prior,retry){
 const selection=selectRetry(plan,prior);
 if(retry?.schema!==1||retry.expected!==selection.expected||retry.firstPass!==selection.firstPass||
   !Array.isArray(retry.retry)||retry.retry.length!==selection.failed.length||
   !Array.isArray(retry.firstAttemptFailures))throw Error('Retry audit mismatch');
 const keys=selection.failed.map(t=>t.key).sort(),retryKeys=retry.retry.map(r=>r.key).sort();
 if(JSON.stringify(keys)!==JSON.stringify(retryKeys)||JSON.stringify(keys)!==JSON.stringify([...retry.firstAttemptFailures].sort())||
   retry.retry.some(r=>r.firstAttemptPassed!==false||r.attempts!==2||typeof r.retryPassed!=='boolean'))throw Error('Retry identity mismatch');
 const recovered=retry.retry.filter(r=>r.retryPassed).length,finalPassed=selection.firstPass+recovered;
 if(retry.recovered!==recovered||retry.finalPassed!==finalPassed||retry.success!==(finalPassed===selection.expected))throw Error('Retry counts inconsistent');
 return {expected:selection.expected,firstPass:selection.firstPass,recovered,finalPassed,
   unresolved:selection.expected-finalPassed,firstAttemptFailures:keys,cleanFirstPass:keys.length===0};
}
export function observe({plan,prior,retry,runs,adaptive}){
 const c=coverage(plan,prior,retry);
 const legacy=summarizeRun(runs.legacy.run,runs.legacy.jobs),shadow=summarizeRun(runs.shadow.run,runs.shadow.jobs),rerun=summarizeRun(runs.retry.run,runs.retry.jobs);
 if(legacy.conclusion!=='success'||shadow.jobs!==plan.shards.length+2||legacy.jobs!==plan.tasks.length+2||
   (retry.success&&rerun.conclusion!=='success'))throw Error('Run metadata conflicts with coverage evidence');
 const combinedRunnerMs=shadow.runnerMs===null||rerun.runnerMs===null?null:shadow.runnerMs+rerun.runnerMs;
 return {schema:1,mode:'shadow-observation',coverage:c,legacy,shadow,retry:rerun,
   comparison:{taskJobsLegacy:plan.tasks.length,taskJobsShadow:plan.shards.length,taskJobsReduction:1-plan.shards.length/plan.tasks.length,
     actualCombinedRunnerMs:combinedRunnerMs,actualCombinedActiveWallMs:shadow.wallMs===null||rerun.wallMs===null?null:shadow.wallMs+rerun.wallMs,
     warning:'Different concurrency and queue conditions; active wall sum excludes gap between runs. Runner duration is not billed minutes.'},
   forecast:adaptive?{measuredTasks:adaptive.measuredTasks,adaptiveJobs:adaptive.adaptiveJobs,prediction:adaptive.adaptivePrediction,assumptions:adaptive.assumptions}:null,
   migration:{ready:false,reason:'One historical snapshot, retry-assisted coverage; independent PRs and integrated Build Once are still required'}};
}
const minutes=v=>v===null?'unknown':(v/60000).toFixed(1)+' min';
export function markdown(r){
 const c=r.coverage;
 return ['## CI Observatory — shadow only','',
   '| Metric | Legacy | Sharded | Targeted retry |','|---|---:|---:|---:|',
   '| Task jobs | '+r.comparison.taskJobsLegacy+' | '+r.comparison.taskJobsShadow+' | '+c.firstAttemptFailures.length+' |',
   '| All workflow jobs | '+r.legacy.jobs+' | '+r.shadow.jobs+' | '+r.retry.jobs+' |',
   '| Active wall | '+minutes(r.legacy.wallMs)+' | '+minutes(r.shadow.wallMs)+' | '+minutes(r.retry.wallMs)+' |',
   '| Runner duration sum | '+minutes(r.legacy.runnerMs)+' | '+minutes(r.shadow.runnerMs)+' | '+minutes(r.retry.runnerMs)+' |','',
   'Coverage: '+c.firstPass+'/'+c.expected+' first pass; '+c.recovered+' recovered; '+c.finalPassed+'/'+c.expected+' final.',
   'First-attempt failures: '+(c.firstAttemptFailures.join(', ')||'none')+'.','',
   r.comparison.warning,'','Migration: BLOCKED — '+r.migration.reason].join('\n')+'\n';
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [plan,prior,retry,runs,adaptive]=process.argv.slice(2,7).map(p=>JSON.parse(readFileSync(p,'utf8')));
  const r=observe({plan,prior,retry,runs,adaptive}),out=process.argv[7];
  mkdirSync(out,{recursive:true});writeFileSync(join(out,'report.json'),JSON.stringify(r,null,2));
  const md=markdown(r);writeFileSync(join(out,'report.md'),md);console.log(md);
 }catch(e){console.error(e);process.exitCode=1;}
}
