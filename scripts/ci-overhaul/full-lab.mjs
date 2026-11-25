// Full shadow coverage audit. The historical legacy run must be successful,
// and each expected task must have exactly one matching successful result.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertParity, planShards, shadowFromLegacy } from './sharding.mjs';
import { compareEvidence } from './pilot.mjs';

export function fullPlan(raw,{history={}}={}){
  const old=shadowFromLegacy(raw);
  const tasks=old.shards.flatMap(s=>s.tasks);
  if(!tasks.length)throw Error('Refuse empty full baseline');
  // Six tasks at most: even underestimated long tasks must fit hosted runner limits.
  const shards=planShards(tasks,{maxTasks:6,history});
  assertParity(tasks,shards);
  const cpu=shards.filter(s=>s.pool!=='browser'),browser=shards.filter(s=>s.pool==='browser');
  return {schema:1,legacyJobs:tasks.length,shardJobs:shards.length,tasks,shards,
    cpu:{include:cpu},browser:{include:browser},hasCpu:cpu.length>0,hasBrowser:browser.length>0};
}

export function audit(plan,legacyReport,collected){
  assertParity(plan.tasks,plan.shards);
  const issues=[],baseline=Object.create(null),batched=Object.create(null);
  const expected=new Map(plan.tasks.map(t=>[t.key,t]));
  const add=(target,key,value,label)=>{
    if(!expected.has(key)){issues.push('Unexpected '+label+' result: '+key);return;}
    if(Object.hasOwn(target,key)){issues.push('Duplicate '+label+' result: '+key);return;}
    target[key]=value;
  };
  if(legacyReport?.schema!==1||legacyReport.success!==true||legacyReport.expected!==plan.tasks.length||
     legacyReport.passed!==plan.tasks.length||legacyReport.failed!==0||
     !Array.isArray(legacyReport.missing)||legacyReport.missing.length||
     !Array.isArray(legacyReport.results))issues.push('Legacy summary is not a complete success');
  for(const row of legacyReport?.results??[])add(baseline,row?.key,row,'legacy');
  const byId=new Map(plan.shards.map(s=>['shadow-shard-'+s.id,s]));
  for(const entry of readdirSync(collected,{withFileTypes:true})){
    const shard=byId.get(entry.name);
    if(!entry.isDirectory()||!shard){issues.push('Unexpected shard artifact: '+entry.name);continue;}
    const folder=join(collected,entry.name);
    const assigned=new Set(shard.tasks.map(t=>t.key));
    for(const item of readdirSync(folder,{withFileTypes:true})){
      if(!item.isDirectory()||!assigned.has(item.name)){issues.push('Unexpected task in '+shard.id+': '+item.name);continue;}
      try{
        add(batched,item.name,JSON.parse(readFileSync(join(folder,item.name,'result.json'),'utf8')),'batched');
      }catch(error){issues.push('Unreadable result '+item.name+': '+error.message);}
    }
  }
  const report=compareEvidence(plan.tasks,baseline,batched);
  return {...report,legacyJobs:plan.legacyJobs,shardJobs:plan.shardJobs,issues,
    legacyPassed:report.tasks.filter(t=>t.baselinePassed).length,
    batchedPassed:report.tasks.filter(t=>t.batchedPassed).length,
    success:report.success&&issues.length===0};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv[2]==='plan'){
      const plan=fullPlan(readFileSync(process.argv[3],'utf8'));
      writeFileSync(process.argv[4],JSON.stringify(plan,null,2));
      console.log('Legacy tasks: '+plan.legacyJobs+'; full shadow jobs: '+plan.shardJobs);
    }else if(process.argv[2]==='audit'){
      const report=audit(JSON.parse(readFileSync(process.argv[3],'utf8')),
        JSON.parse(readFileSync(process.argv[4],'utf8')),process.argv[5]);
      mkdirSync(process.argv[6],{recursive:true});
      writeFileSync(join(process.argv[6],'audit.json'),JSON.stringify(report,null,2));
      console.log(JSON.stringify(report,null,2));
      if(!report.success)process.exitCode=1;
    }else throw Error('Expected plan or audit command');
  }catch(error){console.error(error);process.exitCode=1;}
}
