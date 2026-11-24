// Live shadow controller; never use historical results as execution evidence.
// The legacy Universal QA remains the delivery authority.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {integratedPlan,readAttempt} from './integrated.mjs';
import {verdict,recover} from './canary-evidence.mjs';
import {planShards,assertParity} from './sharding.mjs';
import {canonical} from './verified-results.mjs';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const write=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2));
export function context(root,env=process.env){
 const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
 if(!env.GITHUB_RUN_ID||!env.GITHUB_RUN_ATTEMPT||!env.GITHUB_REPOSITORY)throw Error('Missing run provenance');
 return {commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),run:env.GITHUB_RUN_ID,attempt:env.GITHUB_RUN_ATTEMPT,repository:env.GITHUB_REPOSITORY};
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
 return {...result,firstPassJobs:plan.shards.length,retryJobs:selection.shards.length,sharedBuildTasks:plan.prebuilt.length,mode:'live-shadow',legacyRequired:true,productionAuthorization:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
 const [mode,...a]=process.argv.slice(2),ctx=context(process.cwd());
 if(mode==='plan'){
  const plan=integratedPlan(readFileSync(a[0],'utf8'),process.cwd());write(a[1],{...plan,context:ctx});
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
   mkdirSync(a[3],{recursive:true});write(join(a[3],'report.json'),report);console.log(JSON.stringify(report,null,2));if(!report.success)process.exitCode=1;
  }else throw Error('Unknown live command');
 }
 }catch(e){console.error(e);process.exitCode=1;}
}
