// Integrated shadow controller. No historical successes are used to satisfy
// first-pass coverage; only evidence from this workflow attempt can do so.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fullPlan, audit } from './full-lab.mjs';
import { selectRetry, reconcile } from './selective-retry.mjs';
import { canonical } from './verified-results.mjs';
import { assertParity } from './sharding.mjs';

const browser=t=>['visual','playwright','browser-node'].includes(t.kind);
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const write=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2));

export function integratedPlan(raw,root,options={}){
 const p=fullPlan(raw,options);
 const prebuilt=p.tasks.filter(t=>browser(t)&&read(join(root,'apps',t.app,'app.config.json')).runtime!=='quick').map(t=>t.key);
 const keys=new Set(prebuilt);
 const decorate=s=>({...s,needsBuild:s.tasks.some(t=>keys.has(t.key))});
 const shards=p.shards.map(decorate);
 assertParity(p.tasks,shards);
 return {...p,shards,prebuilt,hasBuild:prebuilt.length>0,cpu:{include:shards.filter(s=>s.pool!=='browser')},browser:{include:shards.filter(s=>s.pool==='browser')}};
}

// Ensure every artifact contains exactly its assigned tasks and immutable
// identity, even for failures. Missing/corrupt evidence is a controller error.
export function readAttempt(plan,shards,folder,prefix){
 const expected=new Map(shards.map(s=>[prefix+s.id,s]));
 const prebuilt=new Set(plan.prebuilt);
 const records=[],timings=[];
 for(const entry of readdirSync(folder,{withFileTypes:true})){
  const shard=expected.get(entry.name);
  if(!entry.isDirectory()||!shard)throw Error('Unexpected attempt artifact: '+entry.name);
  expected.delete(entry.name);
  const tasks=new Map(shard.tasks.map(t=>[t.key,t]));
  for(const item of readdirSync(join(folder,entry.name),{withFileTypes:true})){
   const t=tasks.get(item.name);
   if(!item.isDirectory()||!t)throw Error('Unexpected attempt task: '+item.name);
   tasks.delete(item.name);
   const dir=join(folder,entry.name,item.name),r=read(join(dir,'result.json')),timing=read(join(dir,'executor-timing.json'));
   if(r.schema!==1||typeof r.success!=='boolean'||canonical(Object.fromEntries(Object.keys(t).map(k=>[k,r[k]])))!==canonical(t))throw Error('Attempt identity mismatch: '+t.key);
   if(r.success&&prebuilt.has(t.key)&&r.buildMode!=='same-run-prebuilt')throw Error('Required build reuse missing: '+t.key);
   if(r.success&&!prebuilt.has(t.key)&&r.buildMode==='same-run-prebuilt')throw Error('Unexpected build reuse: '+t.key);
   if(timing.schema!==1||timing.key!==t.key||timing.pool!==shard.pool||timing.success!==r.success||
     !Number.isSafeInteger(timing.totalMs)||timing.totalMs<0||!timing.phases||
     Object.values(timing.phases).some(v=>!Number.isSafeInteger(v)||v<0))throw Error('Invalid executor timing: '+t.key);
   records.push(r);timings.push(timing);
  }
  if(tasks.size)throw Error('Missing attempt tasks: '+[...tasks.keys()].join(','));
 }
 if(expected.size)throw Error('Missing attempt artifacts: '+[...expected.keys()].join(','));
 return {records,timings};
}

export function firstPass(plan,legacy,folder,{retryLimit=12}={}){
 const evidence=readAttempt(plan,plan.shards,folder,'shadow-shard-');
 const prior=audit(plan,legacy,folder);
 const selection=selectRetry(plan,prior);
 if(selection.failed.length>retryLimit)throw Error('Retry budget exceeded: '+selection.failed.length+' > '+retryLimit);
 const prebuilt=new Set(plan.prebuilt);
 const shards=selection.shards.map(s=>({...s,needsBuild:s.tasks.some(t=>prebuilt.has(t.key))}));
 const cpu=shards.filter(s=>s.pool!=='browser'),web=shards.filter(s=>s.pool==='browser');
 return {prior,selection:{...selection,shards,cpu:{include:cpu},browser:{include:web},hasCpu:cpu.length>0,hasBrowser:web.length>0},timings:evidence.timings};
}

export function finish(plan,legacy,firstFolder,retryFolder){
 const first=firstPass(plan,legacy,firstFolder);
 const second=first.selection.shards.length?readAttempt(plan,first.selection.shards,retryFolder,'retry-shard-'):{records:[],timings:[]};
 if(!first.selection.shards.length&&readdirSync(retryFolder).length)throw Error('Unexpected retry artifacts');
 const result=reconcile(plan,first.prior,second.records);
 const totals={};
 for(const t of [...first.timings,...second.timings]){
  const p=totals[t.pool]??={attempts:0,totalMs:0,phases:{}};
  p.attempts++;p.totalMs+=t.totalMs;
  for(const [k,v] of Object.entries(t.phases))p.phases[k]=(p.phases[k]??0)+v;
 }
 return {...result,mode:'integrated-same-run-shadow',firstPassJobs:plan.shards.length,
  sharedBuildTasks:plan.prebuilt.length,retryJobs:first.selection.shards.length,telemetry:totals,
  migrationReady:false,scope:'One historical input snapshot; first and retry evidence from this workflow attempt only'};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,...a]=process.argv.slice(2);
  if(mode==='plan')write(a[1],integratedPlan(readFileSync(a[0],'utf8'),process.cwd()));
  else if(mode==='first'){
   const result=firstPass(read(a[0]),read(a[1]),a[2]);
   mkdirSync(a[3],{recursive:true});write(join(a[3],'audit.json'),result.prior);write(join(a[3],'retry.json'),result.selection);
   console.log('First pass: '+result.prior.batchedPassed+'/'+result.prior.legacyJobs+'; retries: '+result.selection.failed.length);
  }else if(mode==='finish'){
   const result=finish(read(a[0]),read(a[1]),a[2],a[3]);
   mkdirSync(a[4],{recursive:true});write(join(a[4],'integrated-report.json'),result);
   console.log(JSON.stringify(result,null,2));if(!result.success)process.exitCode=1;
  }else throw Error('Expected plan, first or finish');
 }catch(e){console.error(e);process.exitCode=1;}
}
