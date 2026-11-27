// Read-only audit of a completed eight-shard experiment. No production admission.
import {readFileSync,readdirSync,lstatSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual as eq} from 'node:util';
import {makeReceipt,aggregateReplay,PLAN,SOURCE,WORKFLOW,REPLAY_WORKFLOW,validateManifest} from './verified-gameplay-receipt.mjs';
const REPO='JustSadSock/pocket-works',SHA=/^[a-f0-9]{40}$/,positive=n=>Number.isSafeInteger(n)&&n>0;
const fail=msg=>{throw Error(msg);};
const json=p=>{const st=lstatSync(p);if(!st.isFile()||st.size>4_000_000)fail('Invalid JSON evidence: '+p);return JSON.parse(readFileSync(p,'utf8'));};
const exact=(path,names)=>{if(!lstatSync(path).isDirectory()||!eq(readdirSync(path).sort(),[...names].sort()))fail('Incomplete or unexpected evidence: '+path);};
export function validateRuns(source,replay){
 for(const [r,path,events] of [[source,WORKFLOW,['push','workflow_dispatch']],[replay,REPLAY_WORKFLOW,['workflow_run']]]){
  if(!r||!positive(r.id)||!positive(r.run_attempt)||r.repository?.full_name!==REPO||r.head_repository?.full_name!==REPO||r.path!==path||r.head_branch!=='main'||!SHA.test(r.head_sha)||r.status!=='completed'||r.conclusion!=='success'||!events.includes(r.event))fail('Untrusted or incomplete run metadata');
 }
 if(source.id===replay.id||source.head_sha!==replay.head_sha||!Number.isFinite(Date.parse(source.updated_at))||!Number.isFinite(Date.parse(replay.created_at))||Date.parse(source.updated_at)>Date.parse(replay.created_at))fail('Runs are not independent consecutive exact-commit evidence');
 return source.head_sha;
}
export function jobSeconds(payload,names,attempt){
 if(!Array.isArray(payload?.jobs)||payload.total_count!==payload.jobs.length)fail('Incomplete jobs API response');
 const jobs=payload.jobs.filter(x=>names.includes(x.name));
 if(jobs.length!==names.length||new Set(jobs.map(x=>x.name)).size!==names.length)fail('Missing or duplicate required job');
 return Object.fromEntries(jobs.map(j=>{
  const started=Date.parse(j.started_at),completed=Date.parse(j.completed_at);
  if(j.run_attempt!==attempt||j.status!=='completed'||j.conclusion!=='success'||!Number.isFinite(started)||!Number.isFinite(completed)||completed<started)fail('Invalid completed job timing: '+j.name);
  return [j.name,(completed-started)/1000];
 }));
}
export function auditShard(receipt,source,trial,replay,shard){
 const m=validateManifest(receipt.manifest,'source');
 if(receipt.schema!==2||receipt.shard!==shard||m.shard!==shard||m.run!==source.id||m.attempt!==source.run_attempt||m.auditCommit!==source.head_sha||m.event!==source.event||receipt.planDigest!==PLAN||receipt.productionAuthorization!==false||receipt.allowResultReuse!==false||receipt.allowImpactSkipping!==false)fail('Wrong signed source shard');
 for(const r of [trial,replay]){
  if(r.shard!==shard||r.auditTree!==m.auditTree||r.sourceGameplaySemanticDigest!==receipt.gameplaySemanticDigest||r.historicalGameplayMeasurements!==receipt.sourceMeasurements||r.gameplayCases!==receipt.gameplayCases||r.gameplayReused&&r.admission?.gameplayRecordsDigest!==receipt.gameplayRecordsDigest)fail('Replay does not match signed primary evidence');
 }
 return m.auditTree;
}
export function summarizeTimings(sourceJobs,replayJobs,trial,replay){
 const rows=Array.from({length:8},(_,shard)=>{
  const sourceSeconds=sourceJobs['execute ('+shard+')'],trialSeconds=sourceJobs['trial ('+shard+')'],replaySeconds=replayJobs['replay ('+shard+')'];
  if(![sourceSeconds,trialSeconds,replaySeconds].every(n=>Number.isFinite(n)&&n>=0))fail('Missing job timing');
  return {shard,sourceSeconds,trialSeconds,replaySeconds,trialDecision:trial.perShard[shard].decision,replayDecision:replay.perShard[shard].decision};
 });
 const sum=key=>rows.reduce((n,r)=>n+r[key],0);
 return {scope:'observed whole-job durations; different phases and runners, not net CI savings',sourceJobSeconds:sum('sourceSeconds'),trialJobSeconds:sum('trialSeconds'),replayJobSeconds:sum('replaySeconds'),trialHitShards:rows.filter(r=>r.trialDecision==='reuse-shadow').length,replayHitShards:rows.filter(r=>r.replayDecision==='reuse-shadow').length,rows};
}
// Diagnostic counterfactual only. No execution policy is changed here.
export function portabilityProfile(trial,cross){
 const categories=['exact','kernel-only','cpu-only','cpu-and-kernel','other'];
 const counts=Object.fromEntries(categories.map(k=>[k,{shards:0,cases:0,freshMatchedCases:0}]));
 const passes=[];
 for(const [mode,report] of [['same-run',trial],['historical',cross]]){
  if(report.productionAuthorization!==false||report.allowResultReuse!==false||report.allowImpactSkipping!==false||report.gameplayCases!==1868||report.shards!==8||!Array.isArray(report.perShard)||report.perShard.length!==8)fail('Incomplete non-production portability evidence');
  const local=Object.fromEntries(categories.map(k=>[k,{shards:0,cases:0,freshMatchedCases:0}]));
  for(const [i,r] of report.perShard.entries()){
   const n=i<4?234:233,fields=r.changedFields;
   if(r.shard!==i||!Array.isArray(fields)||fields.some(k=>typeof k!=='string')||new Set(fields).size!==fields.length)fail('Invalid environment difference evidence');
   const hit=r.decision==='reuse-shadow';
   if(hit?(r.semanticComparison!=='not-executed'||r.reusedGameplayCases!==n||r.freshGameplayCases!==0||r.reason!==null||fields.length!==0):(r.decision!=='execute'||r.semanticComparison!=='match'||r.reusedGameplayCases!==0||r.freshGameplayCases!==n||typeof r.reason!=='string'))fail('Unverified portability comparison');
   const key=hit?'exact':r.reason!=='Execution environment differs'?'other':eq(fields,['kernel'])?'kernel-only':eq(fields,['cpu'])?'cpu-only':eq([...fields].sort(),['cpu','kernel'])?'cpu-and-kernel':'other';
   for(const c of [local[key],counts[key]]){c.shards++;c.cases+=n;c.freshMatchedCases+=hit?0:n;}
  }
  const observed=local.exact.cases;
  if(observed!==report.reusedGameplayCases||1868-observed!==report.freshGameplayCases)fail('Portability counts differ from audited totals');
  passes.push({mode,observedReusedCases:observed,categories:local,kernelOnlyCounterfactualCases:observed+local['kernel-only'].cases});
 }
 const observed=counts.exact.cases,kernelOnly=counts['kernel-only'].cases,total=3736;
 return {schema:1,scope:'diagnostic only; no eligibility change, no estimated runner savings',totalReplayCases:total,observedReusedCases:observed,observedReuseFraction:observed/total,observedFreshMatchedCases:total-observed,categories:counts,passes,kernelOnlyCounterfactualCases:observed+kernelOnly,kernelOnlyCounterfactualFraction:(observed+kernelOnly)/total,productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
}
export function audit(root){
 const source=json(join(root,'source.json')),replay=json(join(root,'replay.json')),sha=validateRuns(source,replay);
 const names=Array.from({length:8},(_,i)=>String(i)),primary=join(root,'primary'),same=join(root,'same'),historical=join(root,'historical');
 for(const path of [primary,same,historical])exact(path,names);
 const trialRows=[],replayRows=[],trees=new Set();
 for(let shard=0;shard<8;shard++){
  const dir=join(primary,String(shard)),bundle=join(dir,'bundle');
  exact(dir,['bundle','receipt.json']);exact(join(same,String(shard)),['trial.json']);exact(join(historical,String(shard)),['trial.json']);
  const receipt=json(join(dir,'receipt.json'));
  // Caller independently verifies the GitHub attestation before invoking this audit.
  if(!eq(receipt,makeReceipt(bundle,receipt.issuedAt)))fail('Signed receipt differs from original bundle');
  const t=json(join(same,String(shard),'trial.json')),h=json(join(historical,String(shard),'trial.json'));
  trees.add(auditShard(receipt,source,t,h,shard));trialRows.push(t);replayRows.push(h);
 }
 if(trees.size!==1)fail('Source tree differs across shards');
 const common={auditCommit:sha,auditTree:[...trees][0],sourceRun:source.id,sourceAttempt:source.run_attempt};
 const trial=aggregateReplay(trialRows,{...common,mode:'verified-gameplay-trial',targetRun:source.id,targetAttempt:source.run_attempt});
 const cross=aggregateReplay(replayRows,{...common,mode:'verified-gameplay-cross-run',targetRun:replay.id,targetAttempt:replay.run_attempt});
 if(!eq(trial,json(join(root,'same-aggregate.json')))||!eq(cross,json(join(root,'historical-aggregate.json'))))fail('Published aggregate differs from independently reconstructed evidence');
 const matrix=prefix=>names.map(n=>prefix+' ('+n+')');
 const sourceJobs=jobSeconds(json(join(root,'source-jobs.json')),['contract',...matrix('execute'),...matrix('attest'),...matrix('trial'),'aggregate'],source.run_attempt);
 const replayJobs=jobSeconds(json(join(root,'replay-jobs.json')),[...matrix('replay'),'aggregate'],replay.run_attempt);
 return {schema:1,kind:'verified-gameplay-completed-pair-audit',...common,planDigest:PLAN,source:SOURCE,replayRun:replay.id,replayAttempt:replay.run_attempt,trial,cross,timings:summarizeTimings(sourceJobs,replayJobs,trial,cross),portability:portabilityProfile(trial,cross),productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [root,out]=process.argv.slice(2),r=audit(root);writeFileSync(out,JSON.stringify(r,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(r,null,2));}
 catch(e){console.error(e.message);process.exitCode=1;}
}
