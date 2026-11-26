// Bounded read-only live CI measurement. No authority over QA execution.
import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const REPO='JustSadSock/pocket-works';
const WORKFLOWS=['universal-qa.yml','validate.yml','ai-mobile-gameplay-qa.yml','cloudflare-monitor.yml','verified-results-shadow.yml'];
const STATES=new Set(['success','failure','cancelled','timed_out','skipped','neutral','action_required','stale','startup_failure']);
const duration=(a,b)=>{const x=Date.parse(a),y=Date.parse(b);return Number.isFinite(x)&&Number.isFinite(y)&&y>=x?y-x:null;};
const positive=n=>Number.isSafeInteger(n)&&n>0;
const conclusion=x=>STATES.has(x)?x:'unknown';
const percentile=(a,p)=>a.length?[...a].sort((x,y)=>x-y)[Math.max(0,Math.ceil(a.length*p)-1)]:null;
const stats=a=>({count:a.length,totalMs:a.reduce((n,x)=>n+x,0),p50Ms:percentile(a,.5),p90Ms:percentile(a,.9),maxMs:a.length?Math.max(...a):null});
export function measureRun(run,jobs,workflow){
 if(!WORKFLOWS.includes(workflow)||!positive(run?.id)||!positive(run.run_attempt)||run.status!=='completed'||
    run.repository?.full_name!==REPO||run.path!=='.github/workflows/'+workflow||
    !Array.isArray(jobs)||!jobs.length||new Set(jobs.map(j=>j.id)).size!==jobs.length)
   throw Error('Incomplete or unexpected run metadata');
 const counts={},measured=[],cpu=[],browser=[];
 let skipped=0,unknown=0;
 for(const j of jobs){
  if(!positive(j.id)||j.run_id!==run.id||j.run_attempt!==run.run_attempt||j.status!=='completed')throw Error('Unexpected job identity');
  const c=conclusion(j.conclusion);counts[c]=(counts[c]??0)+1;
  if(c==='skipped'){skipped++;continue;}
  const d=duration(j.started_at,j.completed_at);
  if(d===null){unknown++;continue;}
  measured.push(d);
  if(/^candidate \/ (?:retry_)?cpu \(/.test(j.name))cpu.push(d);
  if(/^candidate \/ (?:retry_)?browser \(/.test(j.name))browser.push(d);
 }
 const wall=duration(run.run_started_at,run.updated_at);
 return {id:run.id,attempt:run.run_attempt,workflow,branch:run.head_branch==='main'?'main':run.head_branch==='app/crown-and-marches'?'crown-and-marches':run.head_branch==='app/banners-of-war'?'banners-of-war':'other',
  conclusion:conclusion(run.conclusion),wallMs:wall,initialQueueMs:duration(run.created_at,run.run_started_at),
  jobs:jobs.length,skippedJobs:skipped,unmeasuredJobs:unknown,conclusions:counts,
  measuredRunnerMs:measured.reduce((a,b)=>a+b,0),runnerMs:unknown?null:measured.reduce((a,b)=>a+b,0),
  cpuShard:stats(cpu),browserShard:stats(browser)};
}
export function aggregate(rows){
 const groups={};
 for(const r of rows){
  const key=r.workflow+'/'+r.branch+'/'+r.conclusion;
  (groups[key]??=[]).push(r);
 }
 return Object.entries(groups).sort(([a],[b])=>a.localeCompare(b)).map(([key,rs])=>({
  group:key,runs:rs.length,wall:stats(rs.map(r=>r.wallMs).filter(x=>x!==null)),
  queue:stats(rs.map(r=>r.initialQueueMs).filter(x=>x!==null)),
  runner:stats(rs.map(r=>r.runnerMs).filter(x=>x!==null)),
  measuredRunnerMs:rs.reduce((n,r)=>n+r.measuredRunnerMs,0),
  unmeasuredJobs:rs.reduce((n,r)=>n+r.unmeasuredJobs,0),
  skippedJobs:rs.reduce((n,r)=>n+r.skippedJobs,0)
 }));
}
const api=(path,paginate=false)=>JSON.parse(execFileSync('gh',['api',...(paginate?['--paginate','--slurp']:[]),path],{encoding:'utf8',maxBuffer:32*1024*1024,timeout:45000}));
export function collect({limit=12,now=Date.now(),fetch=api}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>20||!Number.isSafeInteger(now))throw Error('Invalid collection bounds');
 const runs=[],errors=[],samples=[];
 const cutoff=now-86400000;
 for(const workflow of WORKFLOWS){
  const data=fetch('repos/'+REPO+'/actions/workflows/'+workflow+'/runs?status=completed&per_page='+limit);
  if(!Array.isArray(data.workflow_runs))throw Error('Invalid workflow response');
  const eligible=data.workflow_runs.filter(r=>Date.parse(r.updated_at)>=cutoff);
  samples.push({workflow,returned:data.workflow_runs.length,withinWindow:eligible.length,limit,possiblyTruncated:data.workflow_runs.length===limit&&eligible.length===limit});
  for(const r of eligible){
   try{
    if(!positive(r.id)||!positive(r.run_attempt))throw Error('Invalid run ID');
    const pages=fetch('repos/'+REPO+'/actions/runs/'+r.id+'/attempts/'+r.run_attempt+'/jobs?per_page=100',true);
    if(!Array.isArray(pages)||!pages.length||pages.some(p=>!Array.isArray(p.jobs)))throw Error('Invalid job pages');
    const jobs=pages.flatMap(p=>p.jobs);
    if(pages.some(p=>p.total_count!==jobs.length))throw Error('Incomplete paginated jobs');
    runs.push(measureRun(r,jobs,workflow));
   }catch(e){errors.push({workflow,id:positive(r.id)?r.id:null,reason:'Job metadata unavailable or invalid'});}
  }
 }
 return {schema:1,mode:'read-only-live-observation',observedAt:new Date(now).toISOString(),windowHours:24,
  samples,runs,groups:aggregate(runs),errors,productionAuthorization:false,
  caveats:['Bounded recent completed runs, not all runs in the window. Latest attempt only.',
   'Wall time uses run_started_at to updated_at. Initial queue proxy excludes later per-job queues.',
   'Runner duration is elapsed time summed across measured jobs, not billed minutes. Skipped jobs excluded.',
   'Cancelled runs grouped separately. Unknown metadata stays unknown. No QA eligibility decisions.']};
}
const min=x=>x===null?'unknown':(x/60000).toFixed(2);
export function markdown(r){
 return ['## Pocket Works CI Observatory — live','',
  'Observed: '+r.observedAt+'; sampled runs: '+r.runs.length+'; unavailable: '+r.errors.length+'.','',
  '| Workflow / branch / conclusion | Runs | Median wall min | P90 wall min | Median initial queue min | Measured runner min | Unknown jobs |',
  '|---|---:|---:|---:|---:|---:|---:|',
  ...r.groups.map(g=>'| '+g.group+' | '+g.runs+' | '+min(g.wall.p50Ms)+' | '+min(g.wall.p90Ms)+' | '+min(g.queue.p50Ms)+' | '+min(g.measuredRunnerMs)+' | '+g.unmeasuredJobs+' |'),
  '',...r.caveats,''].join('\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.env.GITHUB_REPOSITORY!==REPO||process.env.GITHUB_REF!=='refs/heads/main')throw Error('Only main repository controller may collect live data');
  const out=process.argv[2],r=collect();
  mkdirSync(out,{recursive:true});writeFileSync(join(out,'report.json'),JSON.stringify(r,null,2)+'\n');
  const md=markdown(r);writeFileSync(join(out,'report.md'),md);console.log(md);
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,md);
 }catch(e){console.error('Live observatory collection failed');process.exitCode=1;}
}
