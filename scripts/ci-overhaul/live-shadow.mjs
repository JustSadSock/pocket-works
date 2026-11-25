// Live shadow controller; never use historical results as execution evidence.
// The legacy Universal QA remains the delivery authority.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {integratedPlan,readAttempt} from './integrated.mjs';
import {verdict,recover} from './canary-evidence.mjs';
import {planShards,assertParity,shadowFromLegacy} from './sharding.mjs';
import {changedApps,resolveTasks,partition} from '../universal-qa/plan.mjs';
import {canonical} from './verified-results.mjs';
import {liveSchedulingHistory} from './live-scheduling.mjs';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const write=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2));
export function context(root,env=process.env){
 const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
 if(!env.GITHUB_RUN_ID||!env.GITHUB_RUN_ATTEMPT||!env.GITHUB_REPOSITORY)throw Error('Missing run provenance');
 return {commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),run:env.GITHUB_RUN_ID,attempt:env.GITHUB_RUN_ATTEMPT,repository:env.GITHUB_REPOSITORY};
}
// The old planner intentionally returns no tasks for infrastructure-only PRs.
// Exercise representative CPU, browser and shared-build paths instead of
// issuing an empty coverage verdict. Never substitute smoke for app changes.
export function livePlan(raw,root,{eventName,base,head}={}){
 const original=shadowFromLegacy(raw);
 if(original.legacyJobs>0)return {...integratedPlan(raw,root,{history:liveSchedulingHistory(original.shards.flatMap(s=>s.tasks))}),coverageScope:eventName==='pull_request'?'original-pr-plan':'explicit-smoke',originalLegacyJobs:eventName==='pull_request'?original.legacyJobs:null};
 if(eventName!=='pull_request'||changedApps(root,base,head).length!==0)throw Error('Empty application plan cannot be replaced by infrastructure smoke');
 const tasks=resolveTasks(root,{apps:['axis-pals','crumple-yard'],profile:'smoke',pullRequest:true});
 const m=partition(tasks);
 if(!m.cpu.include.length||!m.browser.include.length)throw Error('Infrastructure smoke must exercise CPU and browser paths');
 const smoke='cpu_matrix='+JSON.stringify(m.cpu)+'\nbrowser_matrix='+JSON.stringify(m.browser)+'\nexpected='+JSON.stringify(tasks.map(t=>t.key))+'\n';
 const plan=integratedPlan(smoke,root);
 if(!plan.hasBuild)throw Error('Infrastructure smoke must exercise shared build');
 return {...plan,coverageScope:'infrastructure-smoke',originalLegacyJobs:0};
}
export function selectLiveRetry(plan,records,tree,limit=12){
 assertParity(plan.tasks,plan.shards);
 const initial=verdict(plan.tasks,records,tree);
 if(initial.failed.length>limit)throw Error('Retry budget exceeded');
 const failed=new Set(initial.failed),prebuilt=new Set(plan.prebuilt);
 const shards=planShards(plan.tasks.filter(t=>failed.has(t.key)),{maxTasks:1}).map(s=>({...s,needsBuild:s.tasks.some(t=>prebuilt.has(t.key))}));
 const cpu=shards.filter(s=>s.pool!=='browser'),browser=shards.filter(s=>s.pool==='browser');
 return {initial,shards,cpu:{include:cpu},browser:{include:browser},hasCpu:cpu.length>0,hasBrowser:browser.length>0};
}
export function completeLive(plan,first,second,tree){
 const selection=selectLiveRetry(plan,first,tree);
 const result=recover(plan.tasks,first,second,tree);
 return {...result,firstPassJobs:plan.shards.length,retryJobs:selection.shards.length,sharedBuildTasks:plan.prebuilt.length,mode:'live-shadow',coverageScope:plan.coverageScope??'original-pr-plan',originalLegacyJobs:plan.originalLegacyJobs??null,legacyRequired:true,productionAuthorization:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
 const [mode,...a]=process.argv.slice(2),ctx=context(process.cwd());
 if(mode==='plan'){
  const plan=livePlan(readFileSync(a[0],'utf8'),process.cwd(),{eventName:process.env.GITHUB_EVENT_NAME,base:process.env.QA_BASE_SHA,head:process.env.QA_HEAD_SHA});write(a[1],{...plan,context:ctx});
 }else{
  const plan=read(a[0]);if(canonical(plan.context)!==canonical(ctx))throw Error('Plan provenance mismatch');
  const first=readAttempt(plan,plan.shards,a[1],'shadow-shard-');
  const selection=selectLiveRetry(plan,first.records,ctx.tree);
  if(mode==='first'){
   mkdirSync(a[2],{recursive:true});write(join(a[2],'retry.json'),selection);
  }else if(mode==='finish'){
   const second=readAttempt(plan,selection.shards,a[2],'retry-shard-');
   const report=completeLive(plan,first.records,second.records,ctx.tree);
   const totals={};
   for(const t of [...first.timings,...second.timings]){
    const p=totals[t.pool]??={attempts:0,totalMs:0,phases:{}};p.attempts++;p.totalMs+=t.totalMs;
    for(const [k,v] of Object.entries(t.phases))p.phases[k]=(p.phases[k]??0)+v;
   }
   report.telemetry=totals;
   report.taskTimings={first:first.timings, retry:second.timings};
   report.shardEstimates=plan.shards.map(s=>({id:s.id,pool:s.pool,estimatedMs:s.estimatedMs,keys:s.tasks.map(t=>t.key)}));
   mkdirSync(a[3],{recursive:true});write(join(a[3],'report.json'),report);console.log(JSON.stringify(report,null,2));if(!report.success)process.exitCode=1;
  }else throw Error('Unknown live command');
 }
 }catch(e){console.error(e);process.exitCode=1;}
}
