// Experimental split: complete coverage, no receipt or production authorization.
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {projectBanners} from './full-simulation-repeatability.mjs';
export const SOURCE='11c8e8411b20e8465cafcc0bad51b1f0a6cff2d1';
export const CURRENT_SOURCE='9a235c0c003ed150ebaa77340fd8964df1d5c731';
export const GROUPS=['original','independent','historical','antiquity','final-integration','numerical-superiority','performance'];
const image='node@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb';
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
function stable(v){
 if(v===null||typeof v==='boolean'||typeof v==='string'||typeof v==='number'&&Number.isFinite(v))return v;
 if(Array.isArray(v))return v.map(stable);
 if(plain(v))return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));
 throw Error('Unsupported JSON value');
}
const digest=v=>createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
const equal=(a,b)=>digest(a)===digest(b);
export function partition(queue,count=8){
 if(!Array.isArray(queue)||!Number.isSafeInteger(count)||count!==8||!queue.length)throw Error('Invalid original matrix');
 const shards=Array.from({length:count},()=>({gameplay:[],performance:[]}));
 const ids=new Set();
 queue.forEach(([kind,value],index)=>{
  if(!GROUPS.includes(kind))throw Error('Unknown original case kind');
  const id=digest([index,kind,value]);if(ids.has(id))throw Error('Duplicate case identity');ids.add(id);
  const row={index,kind,value,id};
  shards[index%count][kind==='performance'?'performance':'gameplay'].push(row);
 });
 const perf=shards.flatMap(s=>s.performance).sort((a,b)=>a.index-b.index);
 if(!equal(perf.map(r=>r.value),[26,40,60,100,150]))throw Error('Original performance coverage changed');
 if(shards.reduce((n,s)=>n+s.gameplay.length+s.performance.length,0)!==queue.length)throw Error('Coverage lost');
 return {schema:1,count,total:queue.length,shards,planDigest:digest(shards),productionAuthorization:false};
}
export async function loadOriginal(root){
 const load=p=>import(pathToFileURL(join(root,'apps/banners-of-war',p)).href);
 const [n,f,a,c]=await Promise.all(['numbers-lab.mjs','final-integration-lab.mjs','antiquity-lab.mjs','completion-lab.mjs'].map(load));
 const queue=[...n.numberCases().map(k=>['numerical-superiority',k]),...c.originalCases().map(k=>['original',k]),...c.extraCases().map(k=>['independent',k]),...c.historicalCases().map(k=>['historical',k]),...a.antiquityCases().map(k=>['antiquity',k]),...f.finalCases().map(k=>['final-integration',k]),...[26,40,60,100,150].map(k=>['performance',k])];
 return {plan:partition(queue),version:c.MATRIX_VERSION,execute:r=>r.kind==='antiquity'?a.antiquityTrial(r.value):r.kind==='final-integration'?f.finalTrial(r.value):r.kind==='numerical-superiority'?n.numberTrial(r.value):c.runCase(r.kind,r.value)};
}
export function runPhase(original,shard,phase,dir,context){
 if(!Number.isInteger(shard)||shard<0||shard>=8||!['gameplay','performance'].includes(phase))throw Error('Unknown phase');
 const {plan,version,execute}=original,rows=plan.shards[shard][phase];
 mkdirSync(dir,{recursive:true});const file=join(dir,'records.jsonl');writeFileSync(file,'');
 const records=[];
 for(const r of rows){
  const result=execute(r);
  if(!plain(result))throw Error('Invalid case result');
  const record={index:r.index,id:r.id,kind:r.kind,version,result};records.push(record);appendFileSync(file,JSON.stringify(record)+'\n');
  if(records.length%10===0)console.log(phase,records.length,'/',rows.length);
 }
 const report={schema:1,...context,shard,phase,planDigest:plan.planDigest,version,expected:rows.length,completed:records.length,recordDigest:digest(records),productionAuthorization:false};
 writeFileSync(join(dir,'phase.json'),JSON.stringify(report,null,2)+'\n');
 return report;
}
export function combine(plan,version,shard,phases,context){
 if(!Number.isInteger(shard)||shard<0||shard>=8||!Array.isArray(phases)||phases.length!==2)throw Error('Missing phase coverage');
 const all=[];
 for(const phase of ['gameplay','performance']){
  const list=phases.filter(p=>p.report.phase===phase);
  if(list.length!==1)throw Error('Duplicate or missing phase');
  const {report:r,records}=list[0],expected=plan.shards[shard][phase];
  if(r.schema!==1||r.source!==context.source||r.run!==context.run||r.attempt!==context.attempt||r.auditCommit!==context.auditCommit||r.shard!==shard||r.planDigest!==plan.planDigest||r.version!==version||r.productionAuthorization!==false||r.expected!==expected.length||r.completed!==expected.length||records.length!==expected.length||r.recordDigest!==digest(records))throw Error('Invalid phase evidence');
  records.forEach((x,i)=>{const p=expected[i];if(x.index!==p.index||x.id!==p.id||x.kind!==p.kind||x.version!==version||!plain(x.result))throw Error('Phase case identity/order mismatch');});
  all.push(...records);
 }
 const rows=all.sort((a,b)=>a.index-b.index).map(({kind,version,result})=>({kind,version,result}));
 const groups=Object.fromEntries(GROUPS.map(k=>[k,rows.filter(r=>r.kind===k).length]));
 const summary={version,shard,count:8,expected:rows.length,completed:rows.length,groups};
 return {rows,summary};
}
export function compareLegacy(plan,version,shard,phases,legacy,context){
 const split=combine(plan,version,shard,phases,context);
 if(!equal(legacy.summary,split.summary))throw Error('Original coverage differs');
 // The existing audited projection is intentionally limited to seed 0.
 if(shard!==0)throw Error('No audited projection for this shard');
 const expected=plan.shards[shard].gameplay.concat(plan.shards[shard].performance).sort((a,b)=>a.index-b.index).map(r=>r.kind);
 const a=projectBanners(legacy.rows,legacy.summary,expected),b=projectBanners(split.rows,split.summary,expected);
 const semanticMatch=equal(a.semantic,b.semantic);
 return {schema:1,source:context.source,planDigest:plan.planDigest,totalOriginalCases:plan.total,shard,gameplayCases:plan.shards[shard].gameplay.length,performanceCases:plan.shards[shard].performance.length,allPerformanceSizes:plan.shards.flatMap(s=>s.performance).sort((a,b)=>a.index-b.index).map(r=>r.value),semanticMatch,legacyGameplayDigest:digest(a.semantic),splitGameplayDigest:digest(b.semantic),legacyMeasurements:a.metrics.length,freshSplitMeasurements:b.metrics.length,rawMatch:equal(legacy.rows,split.rows),freshPerformanceRequired:true,productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
}
// Crown's complete balance reports mix measurement and semantic work in the
// same execution. Keep these fresh, rather than misrepresenting short probes
// as equivalent coverage. Existing memory and browser performance are fresh.
export function classify(app,suite){
 if(app==='banners-of-war'&&suite==='completion-lab')return {mode:'split-shadow',gameplay:'execute',performance:'execute',productionAuthorization:false};
 if(app==='crown-and-marches'&&suite==='balance-experiments')return {mode:'coupled-fresh',gameplay:'execute',performance:'execute',productionAuthorization:false};
 return {mode:'fresh',gameplay:'execute',performance:'execute',productionAuthorization:false};
}
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const jsonl=p=>{const s=readFileSync(p,'utf8').trim();return s?s.split('\n').map(x=>JSON.parse(x)):[];};
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,...a]=process.argv.slice(2);
  const context={source:process.env.SOURCE_SHA,run:Number(process.env.GITHUB_RUN_ID),attempt:Number(process.env.GITHUB_RUN_ATTEMPT),auditCommit:process.env.GITHUB_SHA};
  if(![SOURCE,CURRENT_SOURCE].includes(context.source)||!Number.isSafeInteger(context.run)||context.run<1||!Number.isSafeInteger(context.attempt)||context.attempt<1||!/^[a-f0-9]{40}$/.test(context.auditCommit))throw Error('Invalid audit context');
  if(mode==='plan'){
   const [root,out]=a,o=await loadOriginal(root);writeFileSync(out,JSON.stringify({plan:o.plan,version:o.version,context},null,2)+'\n');
   console.log(JSON.stringify({source:context.source,total:o.plan.total,shards:o.plan.shards.map((s,i)=>({shard:i,gameplay:s.gameplay.length,performance:s.performance.map(r=>r.value)})),productionAuthorization:false}));
  }else if(mode==='phase'){
   const [root,shard,phase,out]=a;runPhase(await loadOriginal(root),Number(shard),phase,out,context);
  }else if(mode==='compare'){
   const [planPath,legacyPath,gamePath,perfPath,out]=a,p=json(planPath);
   if(!equal(p.context,context)||p.plan.productionAuthorization!==false||p.plan.planDigest!==digest(p.plan.shards))throw Error('Invalid plan context');
   const phase=dir=>({report:json(join(dir,'phase.json')),records:jsonl(join(dir,'records.jsonl'))});
   const legacy={rows:jsonl(join(legacyPath,'completion-0.jsonl')),summary:json(join(legacyPath,'completion-0-summary.json'))};
   const report=compareLegacy(p.plan,p.version,0,[phase(gamePath),phase(perfPath)],legacy,context);
   writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.semanticMatch)process.exitCode=1;
  }else throw Error('Unknown mode');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
