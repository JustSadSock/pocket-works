// Production-shaped admission policy, exercised only in an isolated shadow workflow.
import {readFileSync,writeFileSync,lstatSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual as eq} from 'node:util';
import {aggregate as validateProbe, classifyEnvironment, CONTROLLER,SOURCE_RUN} from './gameplay-portability-probe.mjs';
import {makeReceipt,validateManifest,validatePlan,validatePhase,SOURCE,PLAN,WORKFLOW,summarizeGameplayComparison} from './verified-gameplay-receipt.mjs';
export const POLICY='directed-shard-environment-v1',PROBE_RUN=45835826339,PROBE_HEAD='bedfcc9304c3790c5fdf9fc4e3803085634ad388',PROBE_COMMIT='6809dbfad36643055f823195eb33d1b6a181646f',PROBE_MERGE='138a300a6a3401bf169effe397764fbf30993fb6',PROBE_ARTIFACT=15127336596;
const TREE='aeb2031b2dbe609d7ca2327901025936a9c833f1',REPO='JustSadSock/pocket-works',HEX=/^[a-f0-9]{64}$/,SHA=/^[a-f0-9]{40}$/,MAX_AGE=7*86400000;
const flags={productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
const fail=s=>{throw Error(s);},positive=n=>Number.isSafeInteger(n)&&n>0,validShard=n=>Number.isInteger(n)&&n>=0&&n<8;
const json=p=>{const s=lstatSync(p);if(!s.isFile()||s.size>4_000_000)fail('Invalid JSON evidence');return JSON.parse(readFileSync(p,'utf8'));};
const nCases=i=>i<4?234:233;
export function validatePolicyEvidence(probe,run,pr){
 if(run?.id!==PROBE_RUN||run.run_attempt!==1||run.head_sha!==PROBE_HEAD||run.head_branch!=='infra/gameplay-environment-portability'||run.event!=='pull_request'||run.path!=='.github/workflows/gameplay-portability-probe.yml'||run.repository?.full_name!==REPO||run.head_repository?.full_name!==REPO||run.status!=='completed'||run.conclusion!=='success'||pr?.number!==1404||pr.merged!==true||pr.merge_commit_sha!==PROBE_MERGE||pr.head?.sha!==PROBE_HEAD||pr.head?.repo?.full_name!==REPO||pr.base?.ref!=='main'||pr.base?.repo?.full_name!==REPO)fail('Untrusted policy experiment');
 const ctx={run:PROBE_RUN,attempt:1,commit:PROBE_COMMIT,ref:'refs/pull/1404/merge'};
 if(!eq(probe,validateProbe(probe.perShard,ctx)))fail('Invalid or incomplete portability aggregate');
 return probe;
}
export function decideAdmission(receipt,target,plan,probe,upstream,context,now=Date.now()){
 const fresh=(reason,extra={})=>({schema:1,policy:POLICY,decision:'execute',reason,...extra,...flags});
 try{
  if(!validShard(context.shard)||!positive(context.run)||!positive(context.attempt)||!SHA.test(context.commit)||!/^refs\/pull\/\d+\/merge$/.test(context.ref))fail('Invalid target run');
  const t=validateManifest(target,'source',false);
  if(t.ref!==context.ref||t.event!=='pull_request'||t.run!==context.run||t.attempt!==context.attempt||t.shard!==context.shard||t.auditCommit!==CONTROLLER||t.auditTree!==TREE)fail('Target controller or run differs');
  const p=validatePlan(plan,t);
  if(!receipt||!probe||!upstream)fail('Authenticated evidence unavailable');
  const s=validateManifest(receipt.manifest,'source');
  if(upstream.id!==SOURCE_RUN||upstream.run_attempt!==1||upstream.head_sha!==CONTROLLER||upstream.path!==WORKFLOW||upstream.repository?.full_name!==REPO||upstream.head_repository?.full_name!==REPO||upstream.head_branch!=='main'||upstream.status!=='completed'||upstream.conclusion!=='success'||upstream.event!==s.event||s.run!==SOURCE_RUN||s.attempt!==1)fail('Untrusted source run');
  if(receipt.kind!=='banners-gameplay-shadow-v2'||receipt.schema!==2||receipt.planDigest!==PLAN||receipt.shard!==t.shard||receipt.gameplayCases!==nCases(t.shard)||receipt.sourceMeasurements!==p.shards[t.shard].gameplay.filter(e=>e.kind!=='numerical-superiority').length*2||Object.keys(flags).some(k=>receipt[k]!==false)||![receipt.gameplaySemanticDigest,receipt.gameplayRecordsDigest,receipt.gameplayPhaseDigest].every(x=>HEX.test(x))||!positive(receipt.issuedAt)||!positive(now)||now<receipt.issuedAt||now-receipt.issuedAt>MAX_AGE)fail('Invalid or expired receipt');
  for(const key of ['repository','workflow','source','sourceTree','auditCommit','auditTree','shard','sourceMount','auditMount'])if(!eq(s[key],t[key]))fail('Input identity differs: '+key);
  const profile=classifyEnvironment(s.environment,t.environment),row=probe.perShard[t.shard];
  let eligibility='exact';
  if(profile.category!=='exact'){
   if(!['kernel-only','cpu-only','cpu-and-kernel'].includes(profile.category)||!row||row.shard!==t.shard||row.semanticMatch!==true||row.sourceSemanticDigest!==receipt.gameplaySemanticDigest||row.freshSemanticDigest!==receipt.gameplaySemanticDigest||!eq(row.sourceEnvironment,s.environment)||!eq(row.targetEnvironment,t.environment))return fresh('Unapproved directed environment pair',profile);
   eligibility='observed-directed-pair';
  }
  // At least one complete shard is always a fresh canary, rotated by run and attempt.
  if(t.shard===(context.run+context.attempt)%8)return fresh('Mandatory rotating canary',{...profile,eligibility});
  return {schema:1,policy:POLICY,decision:'reuse-shadow',reason:null,eligibility,...profile,gameplaySemanticDigest:receipt.gameplaySemanticDigest,gameplayRecordsDigest:receipt.gameplayRecordsDigest,...flags};
 }catch(e){return fresh(e.message);}
}
function phase(root,name,p,m){
 const dir=join(root,name);if(!eq(readdirSync(dir).sort(),['phase.json','records.jsonl']))fail('Unexpected phase evidence');
 const data=readFileSync(join(dir,'records.jsonl'),'utf8').trim();
 return validatePhase(p,name,json(join(dir,'phase.json')),data?data.split('\n').map(JSON.parse):[],m);
}
function context(){return {run:Number(process.env.GITHUB_RUN_ID),attempt:Number(process.env.GITHUB_RUN_ATTEMPT),commit:process.env.GITHUB_SHA,ref:process.env.GITHUB_REF,shard:Number(process.env.SHARD)};}
function readEvidence(root){
 // The workflow verifies the pinned ZIP digest and source GitHub attestation
 // before this marker is created. A failed acquisition must not create it.
 if(!eq(readdirSync(root).sort(),['authenticated.json','bundle','pr.json','probe-run.json','probe.json','receipt.json','upstream.json']))fail('Missing authenticated evidence');
 const marker=json(join(root,'authenticated.json'));
 if(!eq(marker,{sourceRun:SOURCE_RUN,probeRun:PROBE_RUN,artifact:PROBE_ARTIFACT,shard:Number(process.env.SHARD)}))fail('Wrong authentication marker');
 const receipt=json(join(root,'receipt.json'));
 if(!eq(receipt,makeReceipt(join(root,'bundle'),receipt.issuedAt)))fail('Receipt differs from signed original bundle');
 const probe=validatePolicyEvidence(json(join(root,'probe.json')),json(join(root,'probe-run.json')),json(join(root,'pr.json')));
 const upstream=json(join(root,'upstream.json')),m=receipt.manifest,row=probe.perShard[m.shard];
 if(upstream.id!==SOURCE_RUN||upstream.run_attempt!==1||upstream.head_sha!==CONTROLLER||upstream.path!==WORKFLOW||upstream.repository?.full_name!==REPO||upstream.head_repository?.full_name!==REPO||upstream.head_branch!=='main'||upstream.status!=='completed'||upstream.conclusion!=='success'||upstream.event!==m.event||m.run!==SOURCE_RUN||m.attempt!==1||m.auditCommit!==CONTROLLER||m.auditTree!==TREE||m.shard!==Number(process.env.SHARD)||row.sourceSemanticDigest!==receipt.gameplaySemanticDigest||!eq(row.sourceEnvironment,m.environment))fail('Untrusted or unrelated baseline');
 return {receipt,probe,upstream};
}
export function aggregateAdmission(rows,ctx){
 if(!Array.isArray(rows)||rows.length!==8)fail('Incomplete policy matrix');
 let reused=0,fresh=0,measurements=0,perf=0,portable=0,canaries=0,authenticatedShards=0;
 const ordered=[...rows].sort((a,b)=>a.shard-b.shard);
 for(const [i,r] of ordered.entries()){
  if(r.schema!==1||r.policy!==POLICY||r.shard!==i||r.run!==ctx.run||r.attempt!==ctx.attempt||r.commit!==ctx.commit||r.source!==SOURCE||r.controller!==CONTROLLER||r.planDigest!==PLAN||Object.keys(flags).some(k=>r[k]!==false)||r.gameplayCases!==nCases(i)||r.freshGameplayCases+r.reusedGameplayCases!==nCases(i)||!Number.isInteger(r.freshGameplayMeasurements)||r.freshGameplayMeasurements!==(r.freshGameplayCases?([4,5].includes(i)?428:430):0)||r.semanticMatch===false)fail('Invalid policy coverage '+i);
  const hit=r.admission?.decision==='reuse-shadow';
  if(r.admission?.policy!==POLICY||Object.keys(flags).some(k=>r.admission[k]!==false)||typeof r.authenticatedBaseline!=='boolean'||(hit&&!r.authenticatedBaseline)||(!hit&&r.authenticatedBaseline!==(r.semanticComparison==='match')))fail('Invalid baseline or admission flags');
  authenticatedShards+=Number(r.authenticatedBaseline);
  if(hit?(r.reusedGameplayCases!==nCases(i)||r.freshGameplayCases!==0||r.semanticMatch!==null||r.semanticComparison!=='not-executed'||!['exact','observed-directed-pair'].includes(r.admission.eligibility)):(r.admission?.decision!=='execute'||r.reusedGameplayCases!==0||r.freshGameplayCases!==nCases(i)||!['match','no-authenticated-baseline'].includes(r.semanticComparison)||r.semanticMatch!==(r.semanticComparison==='match'?true:null)))fail('Misleading execution evidence');
  if(i===(ctx.run+ctx.attempt)%8){if(hit)fail('Canary was skipped');canaries++;}
  const sizes=({0:[150],4:[26],5:[40],6:[60],7:[100]})[i]??[];
  if(!Array.isArray(r.performance)||!eq(r.performance.map(x=>x.units),sizes)||r.freshPerformanceMeasurements!==sizes.length*2||!r.performance.every(x=>Number.isFinite(x.plannerMs)&&x.plannerMs>=0&&Number.isFinite(x.physicsMs)&&x.physicsMs>=0))fail('Missing fresh performance');
  reused+=r.reusedGameplayCases;fresh+=r.freshGameplayCases;measurements+=r.freshGameplayMeasurements;perf+=sizes.length;
  if(hit&&r.admission.eligibility==='observed-directed-pair')portable+=r.reusedGameplayCases;
 }
 if(fresh+reused!==1868||perf!==5||canaries!==1)fail('Incomplete matrix');
 return {schema:1,policy:POLICY,...ctx,source:SOURCE,controller:CONTROLLER,planDigest:PLAN,gameplayCases:1868,freshGameplayCases:fresh,reusedGameplayCases:reused,portableReusedCases:portable,freshGameplayMeasurements:measurements,freshPerformanceCases:perf,freshPerformanceMeasurements:perf*2,mandatoryCanaryShards:canaries,authenticatedShards,evidenceReady:authenticatedShards===8,scope:'shadow only; required production QA unchanged',...flags,perShard:ordered};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,...a]=process.argv.slice(2),ctx=context();
  if(process.env.GITHUB_REPOSITORY!==REPO||process.env.GITHUB_EVENT_NAME!=='pull_request'||!positive(ctx.run)||!positive(ctx.attempt)||!SHA.test(ctx.commit)||!/^refs\/pull\/\d+\/merge$/.test(ctx.ref))fail('Invalid shadow context');
  let report,out;
  if(mode==='admit'||mode==='finish'){
   const [target,root,dest,decisionPath]=a,m=validateManifest(json(join(target,'manifest.json')),'source',false),rawPlan=json(join(target,'plan.json')),p=validatePlan(rawPlan,m);
   if(!validShard(ctx.shard)||m.shard!==ctx.shard||m.run!==ctx.run||m.attempt!==ctx.attempt||m.ref!==ctx.ref||m.event!=='pull_request'||m.auditCommit!==CONTROLLER||m.auditTree!==TREE)fail('Wrong fresh runner context');
   let evidence=null;try{evidence=readEvidence(root);}catch(e){console.log('Fresh fallback: '+e.message);}
   const d=decideAdmission(evidence?.receipt,m,rawPlan,evidence?.probe,evidence?.upstream,ctx);
   if(mode==='admit'){report=d;out=dest;}
   else{
    const original=json(decisionPath);
    // A changed or expired admission cannot be consumed as a hit.
    if(!eq(d,original))fail('Admission changed');
    const hit=d.decision==='reuse-shadow',perf=phase(target,'performance',p,m),g=hit?null:phase(target,'gameplay',p,m);
    if(hit&&readdirSync(target).includes('gameplay'))fail('Ambiguous gameplay execution');
    const comparison=evidence?summarizeGameplayComparison(evidence.receipt,d,g):{gameplayCases:g.cases,freshGameplayCases:g.cases,reusedGameplayCases:0,freshGameplayMeasurements:g.measurements,semanticMatch:null,semanticComparison:'no-authenticated-baseline'};
    report={schema:1,policy:POLICY,run:ctx.run,attempt:ctx.attempt,commit:ctx.commit,shard:ctx.shard,source:SOURCE,controller:CONTROLLER,planDigest:PLAN,admission:d,authenticatedBaseline:!!evidence,...comparison,performance:perf.performance,freshPerformanceMeasurements:perf.measurements,...flags};out=dest;
   }
  }else if(mode==='aggregate'){
   const [root,dest]=a,names=Array.from({length:8},(_,i)=>'admission-'+ctx.attempt+'-'+i);
   if(process.env.MATRIX_RESULT!=='success'||!eq(readdirSync(root).sort(),names))fail('Missing shard reports');
   report=aggregateAdmission(names.map(n=>json(join(root,n,'report.json'))),{run:ctx.run,attempt:ctx.attempt,commit:ctx.commit});out=dest;
  }else fail('Unknown policy command');
  writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));if(report.semanticMatch===false||mode==='aggregate'&&!report.evidenceReady)process.exitCode=1;
 }catch(e){console.error(e.message);process.exitCode=1;}
}
