// Adaptive scheduling, shadow-only. Use measured successful task durations,
// conservative setup/build allowances, and unchanged task identity/coverage.
import { readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertParity,planShards } from './sharding.mjs';
import { selectRetry } from './selective-retry.mjs';

const fallback={'node-test':60000,node:180000,visual:120000,playwright:240000,'browser-node':300000};
const isBrowser=t=>['visual','playwright','browser-node'].includes(t.kind);
const validMs=n=>Number.isSafeInteger(n)&&n>0&&n<=2700000;

export function estimateHistory(plan,prior,{enhancedApps=[]}={}){
  selectRetry(plan,prior); // authenticating origin is the caller's responsibility
  const enhanced=new Set(enhancedApps),rows=new Map(prior.tasks.map(r=>[r.key,r]));
  const history=Object.create(null),details=[];
  for(const task of plan.tasks){
    const row=rows.get(task.key);
    const samples=[row.baselineDurationMs,row.batchedPassed?row.batchedDurationMs:null].filter(validMs);
    // Tests exclude dependency install and enhanced site build. Keep these
    // explicit, conservative allowances until measured executor timings exist.
    const setupMs=isBrowser(task)?45000:task.install?45000:15000;
    const buildMs=isBrowser(task)&&enhanced.has(task.app)?240000:0;
    const testMs=samples.length?Math.ceil(Math.max(...samples)*1.3):fallback[task.kind];
    const estimatedMs=Math.min(2700000,testMs+setupMs+buildMs);
    history[task.key]=estimatedMs;
    details.push({key:task.key,samples:samples.length,testMs,setupMs,buildMs,estimatedMs});
  }
  return {history,details};
}
export function predict(shards,{cpuSlots=4,browserSlots=2,jobOverheadMs=30000}={}){
  if(![cpuSlots,browserSlots].every(n=>Number.isSafeInteger(n)&&n>0&&n<=64)||!Number.isSafeInteger(jobOverheadMs)||jobOverheadMs<0)throw Error('Invalid capacity');
  const groups={cpu:[],browser:[]};
  for(const s of shards)groups[s.pool==='browser'?'browser':'cpu'].push(s);
  const schedule=(jobs,slots)=>{
    const lanes=Array(slots).fill(0);
    for(const s of jobs){
      let lane=lanes.indexOf(Math.min(...lanes));
      lanes[lane]+=s.estimatedMs+jobOverheadMs;
    }
    return {jobs:jobs.length,runnerMs:lanes.reduce((a,b)=>a+b,0),makespanMs:Math.max(...lanes)};
  };
  const cpu=schedule(groups.cpu,cpuSlots),browser=schedule(groups.browser,browserSlots);
  return {cpu,browser,runnerMs:cpu.runnerMs+browser.runnerMs,makespanMs:Math.max(cpu.makespanMs,browser.makespanMs)};
}
export function adaptivePlan(plan,prior,options={}){
  const {history,details}=estimateHistory(plan,prior,options);
  const measured=(shards)=>shards.map(s=>({...s,estimatedMs:s.tasks.reduce((n,t)=>n+history[t.key],0)}));
  const baseline=measured(plan.shards);
  // Try several bounded capacities, longest estimated shards first within pool.
  const candidates=[6,4,3,2].flatMap(maxTasks=>[600000,900000].map(targetMs=>{
    const shards=planShards(plan.tasks,{history,maxTasks,targetMs}).sort((a,b)=>b.estimatedMs-a.estimatedMs||a.id.localeCompare(b.id));
    assertParity(plan.tasks,shards);
    return {maxTasks,targetMs,shards,prediction:predict(shards,options)};
  }));
  // Prefer lower predicted elapsed time; within 5%, choose fewer runner-minutes.
  const bestTime=Math.min(...candidates.map(c=>c.prediction.makespanMs));
  const winner=candidates.filter(c=>c.prediction.makespanMs<=bestTime*1.05).sort((a,b)=>a.prediction.runnerMs-b.prediction.runnerMs||a.shards.length-b.shards.length||a.prediction.makespanMs-b.prediction.makespanMs)[0];
  const baselinePrediction=predict(baseline,options);
  const useCandidate=winner.prediction.makespanMs<baselinePrediction.makespanMs||
    (winner.prediction.makespanMs===baselinePrediction.makespanMs&&winner.prediction.runnerMs<baselinePrediction.runnerMs);
  const selected=useCandidate?winner.shards:baseline;
  assertParity(plan.tasks,selected);
  return {schema:1,mode:'advisory',expected:plan.tasks.length,measuredTasks:details.filter(r=>r.samples>0).length,
    baselineJobs:baseline.length,adaptiveJobs:selected.length,baselinePrediction,
    adaptivePrediction:predict(selected,options),selectedCandidate:useCandidate,
    assumptions:{cpuSlots:options.cpuSlots??4,browserSlots:options.browserSlots??2,jobOverheadMs:options.jobOverheadMs??30000,setupAndBuild:'estimated; not measured'},
    details,shards:selected};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const plan=JSON.parse(readFileSync(process.argv[2],'utf8')),prior=JSON.parse(readFileSync(process.argv[3],'utf8'));
    const enhancedApps=[...new Set(plan.tasks.map(t=>t.app))].filter(app=>JSON.parse(readFileSync('apps/'+app+'/app.config.json','utf8')).runtime!=='quick');
    const report=adaptivePlan(plan,prior,{enhancedApps});
    writeFileSync(process.argv[4],JSON.stringify(report,null,2));
    console.log(JSON.stringify({expected:report.expected,measuredTasks:report.measuredTasks,baselineJobs:report.baselineJobs,adaptiveJobs:report.adaptiveJobs,baselinePrediction:report.baselinePrediction,adaptivePrediction:report.adaptivePrediction,selectedCandidate:report.selectedCandidate,assumptions:report.assumptions}));
  }catch(e){console.error(e);process.exitCode=1;}
}
