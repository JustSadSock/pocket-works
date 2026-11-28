// Advisory economic preflight. Never removes tasks or grants production authorization.
import {readFileSync,lstatSync,existsSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describePlan} from './delivery-gate.mjs';
import {taskDigest} from './verified-results.mjs';
import {classifyTask} from './universal-verified-inventory.mjs';
const flags={productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
const nonnegative=n=>Number.isSafeInteger(n)&&n>=0;
const positive=n=>nonnegative(n)&&n>0;
const SHA=/^[a-f0-9]{40}$/;
export const POLICY=Object.freeze({minSamples:3,minSavingsMs:30_000,minSavingsBasisPoints:2000,maxSampleAgeMs:7*86400000});
const fail=s=>{throw Error(s);};
// Inputs must come from an authenticated and independently audited cost ledger for
// any future authoritative use. A modeled or untrusted estimate can never admit work.
export function economicDecision(samples,now=Date.now()){
 const fresh=(reason,extra={})=>({decision:'fresh',reason,...extra,...flags});
 if(!samples||!nonnegative(now)||!Array.isArray(samples.fresh)||!Array.isArray(samples.reuse)||!positive(samples.projectedHits))return fresh('Missing cost evidence');
 const required=['discoveryMs','authenticationMs','preparationMs','verificationMs','aggregationMs','transferMs'];
 const recent=x=>positive(x?.observedAt)&&x.observedAt<=now&&now-x.observedAt<=POLICY.maxSampleAgeMs&&typeof x.sampleId==='string'&&x.sampleId.length>0;
 if(samples.fresh.length<POLICY.minSamples||samples.reuse.length<POLICY.minSamples||new Set(samples.fresh.map(x=>x?.sampleId)).size!==samples.fresh.length||new Set(samples.reuse.map(x=>x?.sampleId)).size!==samples.reuse.length)return fresh('Insufficient independent cost samples');
 if(!samples.fresh.every(x=>recent(x)&&positive(x.executionMs))||!samples.reuse.every(x=>recent(x)&&required.every(k=>nonnegative(x[k]))&&required.some(k=>x[k]>0)&&nonnegative(x.renewalMs)&&x.comparable===true))return fresh('Stale, incomplete or incomparable cost evidence');
 const freshMs=Math.min(...samples.fresh.map(x=>x.executionMs));
 // Attribute full shared work to the candidate until batching is actually measured.
 // Amortize issuance only over a conservative externally justified count; one hit is default.
 const costMs=Math.max(...samples.reuse.map(x=>required.reduce((n,k)=>n+x[k],0)+Math.ceil(x.renewalMs/samples.projectedHits)));
 if(!Number.isSafeInteger(costMs)||!positive(freshMs))return fresh('Cost overflow');
 const savingsMs=freshMs-costMs,bps=Math.floor(savingsMs/freshMs*10000);
 const metrics={freshLowerMs:freshMs,reuseUpperMs:costMs,savingsMs,savingsBasisPoints:bps,projectedHits:samples.projectedHits};
 if(savingsMs<POLICY.minSavingsMs||bps<POLICY.minSavingsBasisPoints)return fresh('Insufficient conservative net savings',metrics);
 return {decision:'candidate-needs-security-audit',reason:'Cost threshold satisfied; security admission still required',...metrics,...flags};
}
// Immutable observation from the prior real pilot, used to decline work only.
// The measured gate and target-preflight spans overlap neither each other nor test
// execution; these are gross observed overheads, not yet a general marginal cost model.
export const PILOT=Object.freeze({sourceRun:46020376393,deliveryRun:46020903299,sourceController:'f528f6387cb3470b22f9e190ca28014f770ec85c',observations:Object.freeze({
 'axis-pals-rules':Object.freeze({freshMs:[308,302,466],observedPreparationMs:22393,observedIndependentGateMs:39838}),
 'press-zip-regression':Object.freeze({freshMs:[182,168]}),
 'flickyard-engine':Object.freeze({freshMs:[76,76]})
})});
export function planEconomics(tasks){
 return tasks.map(t=>{
  const classification=classifyTask(t),observation=PILOT.observations[t.key]??null;
  let reason='No authenticated comparable timing ledger';
  if(classification==='existing-specialized-banners')reason='Existing Banners verified route unchanged';
  else if(!['shadow-pilot','candidate-needs-audit'].includes(classification))reason='Fresh-only task class';
  else if(observation&&Math.max(...observation.freshMs)<POLICY.minSavingsMs)reason='Observed test execution below minimum absolute savings threshold';
  return {task:t.key,taskDigest:taskDigest(t),classification,decision:'execute-original-route',reason,observation,...flags};
 });
}
const json=p=>{const st=lstatSync(p);if(!st.isFile()||st.size>4_000_000)fail('Invalid timing evidence');return JSON.parse(readFileSync(p,'utf8'));};
export function collectTimings(plan,root,identity){
 if(!SHA.test(identity?.source)||!SHA.test(identity?.tree)||!positive(identity?.run)||!positive(identity?.attempt))fail('Invalid timing identity');
 const rows=plan.tasks.map(t=>{
  const path=join(root,'qa-'+t.key,'result.json');
  if(!existsSync(path))return {task:t.key,taskDigest:taskDigest(t),status:'no-fresh-record'};
  const r=json(path);
  if(r.schema!==1||r.success!==true||r.exitCode!==0||r.signal!==null||r.timedOut!==false||r.error||r.verificationMode!==undefined||!nonnegative(r.durationMs)||taskDigest(Object.fromEntries(Object.keys(t).map(k=>[k,r[k]])))!==taskDigest(t))return {task:t.key,taskDigest:taskDigest(t),status:'not-comparable'};
  return {task:t.key,taskDigest:taskDigest(t),status:'fresh-observed',executionMs:r.durationMs};
 });
 return {schema:1,mode:'universal-qa-advisory-timing',identity,planDigest:plan.planDigest,rows,...flags};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const e=process.env,raw='cpu_matrix='+e.QA_CPU_MATRIX+'\nbrowser_matrix='+e.QA_BROWSER_MATRIX+'\nexpected='+e.QA_EXPECTED+'\n',plan=describePlan(raw);
  const [mode,dir,dest]=process.argv.slice(2);
  let report;
  if(mode==='plan')report={schema:1,mode:'advisory-economic-plan',planDigest:plan.planDigest,expected:plan.count,policy:POLICY,rows:planEconomics(plan.tasks),...flags};
  else if(mode==='observe')report=collectTimings(plan,dir,{source:e.GITHUB_SHA,tree:e.QA_TREE,run:Number(e.GITHUB_RUN_ID),attempt:Number(e.GITHUB_RUN_ATTEMPT)});
  else fail('Unknown economic operation');
  const bytes=JSON.stringify(report,null,2)+'\n';if(dest)writeFileSync(dest,bytes,{flag:'wx'});console.log(bytes);
 }catch(e){console.error(e.message);process.exitCode=1;}
}
