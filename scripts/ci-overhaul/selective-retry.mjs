// Selective Retry: never overwrite the original audit or hide first-attempt failures.
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertParity,planShards } from './sharding.mjs';
import { compareEvidence } from './pilot.mjs';

export function selectRetry(plan,prior){
  assertParity(plan.tasks,plan.shards);
  if(prior?.schema!==1||prior.legacyJobs!==plan.tasks.length||
     prior.shardJobs!==plan.shards.length||prior.legacyPassed!==plan.tasks.length||
     !Array.isArray(prior.issues)||prior.issues.length||!Array.isArray(prior.tasks)||
     prior.tasks.length!==plan.tasks.length)throw Error('Untrusted or structurally incomplete prior audit');
  const rows=new Map();
  for(const r of prior.tasks){
    if(!r||typeof r.key!=='string'||rows.has(r.key)||r.baselinePassed!==true||typeof r.batchedPassed!=='boolean')throw Error('Invalid prior task evidence');
    rows.set(r.key,r);
  }
  if(plan.tasks.some(t=>!rows.has(t.key)))throw Error('Prior audit task identity mismatch');
  const failures=plan.tasks.filter(t=>!rows.get(t.key).batchedPassed);
  if(prior.batchedPassed!==plan.tasks.length-failures.length||prior.success!==(failures.length===0))throw Error('Prior audit count mismatch');
  return {schema:1,expected:plan.tasks.length,firstPass:prior.batchedPassed,failed:failures,
    shards:planShards(failures,{maxTasks:1})};
}
export function reconcile(plan,prior,retryResults){
  const selection=selectRetry(plan,prior),expected=new Set(selection.failed.map(t=>t.key));
  if(!Array.isArray(retryResults)||retryResults.length!==expected.size)throw Error('Incomplete retry evidence');
  const rows=new Map();
  for(const r of retryResults){
    if(!r||!expected.has(r.key)||rows.has(r.key))throw Error('Unexpected or duplicate retry result');
    rows.set(r.key,r);
  }
  const retry=selection.failed.map(t=>{
    const r=rows.get(t.key);
    return {key:t.key,firstAttemptPassed:false,retryPassed:compareEvidence([t],{[t.key]:r},{[t.key]:r}).success,attempts:2};
  });
  const recovered=retry.filter(r=>r.retryPassed).length;
  return {schema:1,expected:selection.expected,firstPass:selection.firstPass,recovered,
    finalPassed:selection.firstPass+recovered,firstAttemptFailures:selection.failed.map(t=>t.key),
    retry,success:selection.firstPass+recovered===selection.expected,
    scope:'Historical shadow audit plus one isolated retry; not a clean first-pass run'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const plan=JSON.parse(readFileSync(process.argv[3],'utf8')),prior=JSON.parse(readFileSync(process.argv[4],'utf8'));
    if(process.argv[2]==='select'){
      const selection=selectRetry(plan,prior);
      writeFileSync(process.argv[5],JSON.stringify(selection,null,2));
      console.log(JSON.stringify(selection,null,2));
    }else if(process.argv[2]==='reconcile'){
      const selection=selectRetry(plan,prior);
      const results=selection.failed.map(t=>JSON.parse(readFileSync(join(process.argv[5],t.key,'result.json'),'utf8')));
      const report=reconcile(plan,prior,results);
      mkdirSync(process.argv[6],{recursive:true});
      writeFileSync(join(process.argv[6],'retry-audit.json'),JSON.stringify(report,null,2));
      console.log(JSON.stringify(report,null,2));
      if(!report.success)process.exitCode=1;
    }else throw Error('Expected select or reconcile');
  }catch(e){console.error(e);process.exitCode=1;}
}
