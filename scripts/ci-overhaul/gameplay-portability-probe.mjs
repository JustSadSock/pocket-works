// Prospective fresh-only portability experiment, never production admission.
import {readFileSync,writeFileSync,readdirSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {isDeepStrictEqual as eq} from 'node:util';
import {makeReceipt,validateManifest,validatePlan,validatePhase,SOURCE,PLAN,WORKFLOW} from './verified-gameplay-receipt.mjs';
export const CONTROLLER='2521b436264b904b4c7e88ac9e00a59c0cbbc688',SOURCE_RUN=45825802669;
const REPO='JustSadSock/pocket-works',TREE='aeb2031b2dbe609d7ca2327901025936a9c833f1',HEX=/^[a-f0-9]{64}$/,SHA=/^[a-f0-9]{40}$/;
const fail=s=>{throw Error(s);},positive=n=>Number.isSafeInteger(n)&&n>0;
const json=p=>{const s=lstatSync(p);if(!s.isFile()||s.size>4_000_000)fail('Invalid JSON evidence');return JSON.parse(readFileSync(p,'utf8'));};
const flags={productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
export function classifyEnvironment(source,target){
 const changed=Object.keys(source).filter(k=>source[k]!==target[k]).sort();
 if(!eq(Object.keys(source).sort(),Object.keys(target).sort()))fail('Environment schema differs');
 return {changedFields:changed,category:changed.length===0?'exact':eq(changed,['kernel'])?'kernel-only':eq(changed,['cpu'])?'cpu-only':eq(changed,['cpu','kernel'])?'cpu-and-kernel':'other'};
}
export function compareReceipts(original,fresh,upstream,context){
 const s=validateManifest(original.manifest,'source'),t=validateManifest(fresh.manifest,'source',false);
 if(upstream.id!==SOURCE_RUN||upstream.run_attempt!==1||upstream.head_sha!==CONTROLLER||upstream.path!==WORKFLOW||upstream.head_branch!=='main'||upstream.repository?.full_name!==REPO||upstream.head_repository?.full_name!==REPO||upstream.status!=='completed'||upstream.conclusion!=='success'||upstream.event!==s.event)fail('Invalid original upstream');
 if(!positive(context.run)||!positive(context.attempt)||!SHA.test(context.commit)||!/^refs\/pull\/\d+\/merge$/.test(context.ref)||s.run!==SOURCE_RUN||s.attempt!==1||t.run!==context.run||t.attempt!==context.attempt||t.ref!==context.ref||t.event!=='pull_request'||s.run===t.run||s.shard!==context.shard||t.shard!==context.shard)fail('Wrong prospective run identity');
 for(const m of [s,t])if(m.auditCommit!==CONTROLLER||m.auditTree!==TREE||m.source!==SOURCE)fail('Controller or game revision differs');
 for(const key of ['sourceMount','auditMount'])if(!eq(s[key],t[key]))fail('Mounted inputs differ');
 for(const r of [original,fresh])if(r.schema!==2||r.shard!==context.shard||r.planDigest!==PLAN||!HEX.test(r.gameplaySemanticDigest)||Object.keys(flags).some(k=>r[k]!==false))fail('Invalid fresh comparison receipt');
 if(original.gameplayCases!==fresh.gameplayCases||original.sourceMeasurements!==fresh.sourceMeasurements)fail('Coverage differs');
 const profile=classifyEnvironment(s.environment,t.environment);
 return {schema:1,shard:context.shard,run:context.run,attempt:context.attempt,commit:context.commit,controller:CONTROLLER,sourceRun:SOURCE_RUN,source:SOURCE,planDigest:PLAN,...profile,sourceEnvironment:s.environment,targetEnvironment:t.environment,gameplayCases:fresh.gameplayCases,freshGameplayCases:fresh.gameplayCases,freshGameplayMeasurements:fresh.sourceMeasurements,sourceSemanticDigest:original.gameplaySemanticDigest,freshSemanticDigest:fresh.gameplaySemanticDigest,semanticMatch:original.gameplaySemanticDigest===fresh.gameplaySemanticDigest,...flags};
}
export function aggregate(rows,context){
 if(!Array.isArray(rows)||rows.length!==8)fail('Missing portability shards');
 const ordered=[...rows].sort((a,b)=>a.shard-b.shard),categories={};
 let cases=0,measurements=0,perf=0;
 for(const [i,r] of ordered.entries()){
  if(r.schema!==1||r.shard!==i||r.run!==context.run||r.attempt!==context.attempt||r.commit!==context.commit||r.controller!==CONTROLLER||r.sourceRun!==SOURCE_RUN||r.source!==SOURCE||r.planDigest!==PLAN||Object.keys(flags).some(k=>r[k]!==false)||r.gameplayCases!==(i<4?234:233)||r.freshGameplayCases!==r.gameplayCases||!Number.isInteger(r.freshGameplayMeasurements)||r.freshGameplayMeasurements<0||r.freshGameplayMeasurements>r.gameplayCases*2||!HEX.test(r.sourceSemanticDigest)||r.semanticMatch!==true||r.freshSemanticDigest!==r.sourceSemanticDigest)fail('Invalid or divergent shard '+i);
  const p=classifyEnvironment(r.sourceEnvironment,r.targetEnvironment);
  if(p.category!==r.category||!eq(p.changedFields,r.changedFields))fail('Environment classification mismatch');
  const sizes=({0:[150],4:[26],5:[40],6:[60],7:[100]})[i]??[];
  if(!Array.isArray(r.performance)||!eq(r.performance.map(x=>x.units),sizes)||r.freshPerformanceMeasurements!==sizes.length*2||!r.performance.every(x=>Number.isFinite(x.plannerMs)&&x.plannerMs>=0&&Number.isFinite(x.physicsMs)&&x.physicsMs>=0))fail('Missing fresh performance');
  const c=categories[r.category]??={shards:0,cases:0};c.shards++;c.cases+=r.gameplayCases;
  cases+=r.gameplayCases;measurements+=r.freshGameplayMeasurements;perf+=sizes.length;
 }
 if(cases!==1868||measurements!==3436||perf!==5)fail('Incomplete full matrix');
 return {schema:1,...context,sourceRun:SOURCE_RUN,controller:CONTROLLER,source:SOURCE,planDigest:PLAN,shards:8,freshGameplayCases:cases,freshGameplayMeasurements:measurements,freshPerformanceCases:perf,freshPerformanceMeasurements:perf*2,categories,semanticMatch:true,scope:'prospective fresh-only evidence; no reuse eligibility',...flags,perShard:ordered};
}
const context=()=>({run:Number(process.env.GITHUB_RUN_ID),attempt:Number(process.env.GITHUB_RUN_ATTEMPT),commit:process.env.GITHUB_SHA,ref:process.env.GITHUB_REF});
if(process.argv[1]?.endsWith('/gameplay-portability-probe.mjs')||process.argv[1]==='scripts/ci-overhaul/gameplay-portability-probe.mjs'){
 try{
  const [mode,...a]=process.argv.slice(2),ctx=context();
  if(process.env.GITHUB_REPOSITORY!==REPO||process.env.GITHUB_EVENT_NAME!=='pull_request'||!positive(ctx.run)||!positive(ctx.attempt)||!SHA.test(ctx.commit)||!/^refs\/pull\/\d+\/merge$/.test(ctx.ref))fail('Invalid experiment workflow');
  let report,out;
  if(mode==='compare'){
   const [bundle,receiptPath,target,upstreamPath,dest]=a,original=json(receiptPath),fresh=makeReceipt(target,Date.now(),false);
   if(!eq(original,makeReceipt(bundle,original.issuedAt)))fail('Original signed receipt differs from bundle');
   const p=validatePlan(json(join(target,'plan.json')),fresh.manifest),dir=join(target,'performance');
   if(!eq(readdirSync(dir).sort(),['phase.json','records.jsonl']))fail('Invalid performance files');
   const data=readFileSync(join(dir,'records.jsonl'),'utf8').trim(),perf=validatePhase(p,'performance',json(join(dir,'phase.json')),data?data.split('\n').map(JSON.parse):[],fresh.manifest);
   report={...compareReceipts(original,fresh,json(upstreamPath),{...ctx,shard:Number(process.env.SHARD)}),performance:perf.performance,freshPerformanceMeasurements:perf.measurements};out=dest;
  }else if(mode==='aggregate'){
   const [root,dest]=a,names=Array.from({length:8},(_,i)=>'portability-'+ctx.attempt+'-'+i);
   if(process.env.MATRIX_RESULT!=='success'||!eq(readdirSync(root).sort(),names))fail('Incomplete experiment matrix');
   report=aggregate(names.map(n=>json(join(root,n,'probe.json'))),ctx);out=dest;
  }else fail('Unknown probe mode');
  writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));if(report.semanticMatch!==true)process.exitCode=1;
 }catch(e){console.error(e.message);process.exitCode=1;}
}
