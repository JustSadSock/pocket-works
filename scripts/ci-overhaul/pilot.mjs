// Compare the same real legacy tasks in individual and batched execution.
// No cached successes or missing artifacts may satisfy the pilot.
import { readFileSync, mkdirSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../universal-qa/plan.mjs';
import { planShards, shadowFromLegacy } from './sharding.mjs';
import { executeShard } from './run-shard.mjs';
import { canonical } from './verified-results.mjs';

export function selectPilot(raw){
  const shadow=shadowFromLegacy(raw);
  const tasks=shadow.shards.flatMap(s=>s.tasks).filter(t=>t.kind==='node-test'&&!t.install)
    .sort((a,b)=>a.key.localeCompare(b.key));
  if(tasks.length<2)throw Error('Pilot needs at least two dependency-free real CPU tests');
  return planShards(tasks.slice(0,2),{maxTasks:2})[0];
}

export function compareEvidence(tasks,baseline,batched){
  const records=[];
  for(const task of tasks){
    const one=baseline[task.key],many=batched[task.key];
    const valid=r=>{
      if(!r||r.schema!==1||r.success!==true||r.exitCode!==0||r.signal!==null||r.timedOut!==false||r.error)
        return false;
      const identity=Object.fromEntries(Object.keys(task).map(k=>[k,r[k]]));
      try{return canonical(identity)===canonical(task);}catch{return false;}
    };
    records.push({key:task.key,baselinePassed:valid(one),batchedPassed:valid(many),
      baselineDurationMs:one?.durationMs??null,batchedDurationMs:many?.durationMs??null});
  }
  const exactKeys=r=>Object.keys(r).length===tasks.length&&tasks.every(t=>Object.hasOwn(r,t.key));
  return {schema:1,tasks:records,success:exactKeys(baseline)&&exactKeys(batched)&&records.every(t=>t.baselinePassed&&t.batchedPassed)};
}
const readResults=(folder,tasks)=>Object.fromEntries(tasks.map(t=>{
  try{return [t.key,JSON.parse(readFileSync(join(folder,t.key,'result.json'),'utf8'))];}
  catch{return [t.key,null];}
}));

export async function runPilot(root,raw){
  const shard=selectPilot(raw);
  const lab=join(root,'pilot-evidence'),artifacts=join(root,'qa-artifacts');
  if(existsSync(lab)||existsSync(artifacts))throw Error('Pilot requires clean evidence directories');
  mkdirSync(lab);
  const baselineDir=join(lab,'individual'),batchedDir=join(lab,'batched');
  const singleResults=[];
  for(const task of shard.tasks){
    const single=planShards([task])[0];
    singleResults.push(await executeShard(root,single));
  }
  renameSync(artifacts,baselineDir);
  const batchResult=await executeShard(root,shard);
  renameSync(artifacts,batchedDir);
  const report=compareEvidence(shard.tasks,readResults(baselineDir,shard.tasks),readResults(batchedDir,shard.tasks));
  report.success=report.success&&singleResults.every(r=>r.success)&&batchResult.success;
  report.scope='two dependency-free CPU tasks; not a full-matrix execution equivalence claim';
  writeFileSync(join(lab,'comparison.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const report=await runPilot(ROOT,readFileSync(process.argv[2],'utf8'));if(!report.success)process.exitCode=1;}
  catch(error){console.error(error);process.exitCode=1;}
}
