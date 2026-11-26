// Experimental split: complete coverage, no receipt or production authorization.
import {readFileSync,writeFileSync,mkdirSync,appendFileSync,readdirSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {projectBanners} from './full-simulation-repeatability.mjs';
export const SOURCE='11c8e8411b20e8465cafcc0bad51b1f0a6cff2d1';
export const CURRENT_SOURCE='45d6ce53df3cd5013a605bba972d94f1c0cd8dce';
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
  const result=JSON.parse(JSON.stringify(execute(r)));
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
// Audited projection: same field rules as the original seed-zero audit,
// generalized only after validating the real shard and original case order.
export function projectShard(rows,summary,expected,shard){
 if(!Array.isArray(rows)||!Array.isArray(expected)||!expected.length||rows.length!==expected.length||
   !plain(summary)||summary.version!=='chronicles-completion-v1'||summary.shard!==shard||summary.count!==8||
   summary.expected!==expected.length||summary.completed!==expected.length)throw Error('Incomplete original matrix');
 const groups=Object.fromEntries(GROUPS.map(k=>[k,expected.filter(x=>x===k).length]));
 if(!equal(groups,summary.groups))throw Error('Original group coverage mismatch');
 const metrics=[],semantic=rows.map((row,i)=>{
  if(!plain(row)||row.version!==summary.version||row.kind!==expected[i]||!GROUPS.includes(row.kind)||!plain(row.result))throw Error('Case order mismatch');
  const fields=row.kind==='numerical-superiority'?[]:row.kind==='historical'||row.kind==='performance'?['plannerMs','physicsMs']:['planMs','physicsMs'];
  const result={...row.result};
  for(const field of fields){
   if(!Object.hasOwn(result,field)||!Number.isFinite(result[field])||result[field]<0)throw Error('Invalid runtime measurement: '+i+'/'+field);
   metrics.push({index:i,field,value:result[field]});delete result[field];
  }
  return {...row,result};
 });
 // Retain the already audited seed-zero projection as an independent guard.
 if(shard===0&&!equal(semantic,projectBanners(rows,summary,expected).semantic))throw Error('Seed-zero projection changed');
 return {semantic,metrics};
}
export function compareLegacy(plan,version,shard,phases,legacy,context){
 const split=combine(plan,version,shard,phases,context);
 if(!equal(legacy.summary,split.summary))throw Error('Original coverage differs');
 const entries=plan.shards[shard].gameplay.concat(plan.shards[shard].performance).sort((a,b)=>a.index-b.index);
 const expected=entries.map(r=>r.kind);
 const a=projectShard(legacy.rows,legacy.summary,expected,shard),b=projectShard(split.rows,split.summary,expected,shard);
 const semanticMatch=equal(a.semantic,b.semantic);
 return {schema:1,...context,planDigest:plan.planDigest,totalOriginalCases:plan.total,shard,gameplayCases:plan.shards[shard].gameplay.length,performanceCases:plan.shards[shard].performance.length,performanceSizes:plan.shards[shard].performance.map(r=>r.value),caseIndexes:entries.map(r=>r.index),caseIds:entries.map(r=>r.id),semanticMatch,legacyGameplayDigest:digest(a.semantic),splitGameplayDigest:digest(b.semantic),legacyMeasurements:a.metrics.length,freshSplitMeasurements:b.metrics.length,legacyMeasurementDigest:digest(a.metrics),splitMeasurementDigest:digest(b.metrics),freshPerformanceResults:split.rows.filter(r=>r.kind==='performance').map(r=>r.result),rawMatch:equal(legacy.rows,split.rows),freshPerformanceRequired:true,productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
}
export function aggregate(rows,context){
 if(!Array.isArray(rows)||rows.length!==8)throw Error('Missing shard coverage');
 const ordered=[...rows].sort((a,b)=>a.shard-b.shard),plan=ordered[0].planDigest,total=ordered[0].totalOriginalCases;
 const hashes=/^[a-f0-9]{64}$/;
 if(!hashes.test(plan)||!Number.isSafeInteger(total)||total<5)throw Error('Invalid matrix identity');
 const ids=[],indexes=[],perf=[],perShard=[];
 for(const [shard,r] of ordered.entries()){
  if(r.schema!==1||r.shard!==shard||r.source!==context.source||r.run!==context.run||r.attempt!==context.attempt||r.auditCommit!==context.auditCommit||
   r.planDigest!==plan||r.totalOriginalCases!==total||r.productionAuthorization!==false||r.allowResultReuse!==false||r.allowImpactSkipping!==false||r.freshPerformanceRequired!==true||
   ![r.gameplayCases,r.performanceCases,r.legacyMeasurements,r.freshSplitMeasurements].every(n=>Number.isSafeInteger(n)&&n>=0)||
   r.legacyMeasurements!==r.freshSplitMeasurements||![r.legacyGameplayDigest,r.splitGameplayDigest,r.legacyMeasurementDigest,r.splitMeasurementDigest].every(x=>hashes.test(x))||
   r.semanticMatch!==(r.legacyGameplayDigest===r.splitGameplayDigest)||!Array.isArray(r.caseIds)||!Array.isArray(r.caseIndexes)||r.caseIds.length!==r.gameplayCases+r.performanceCases||r.caseIndexes.length!==r.caseIds.length||
   !r.caseIds.every(x=>hashes.test(x))||!r.caseIndexes.every(n=>Number.isSafeInteger(n)&&n>=0&&n<total&&n%8===shard)||
   !Array.isArray(r.performanceSizes)||!Array.isArray(r.freshPerformanceResults)||r.performanceSizes.length!==r.performanceCases||r.freshPerformanceResults.length!==r.performanceCases||
   !r.freshPerformanceResults.every(x=>plain(x)&&Number.isFinite(x.plannerMs)&&x.plannerMs>=0&&Number.isFinite(x.physicsMs)&&x.physicsMs>=0))throw Error('Invalid shard '+shard);
  ids.push(...r.caseIds);indexes.push(...r.caseIndexes);perf.push(...r.performanceSizes);
  perShard.push({shard,gameplay:r.gameplayCases,performance:r.performanceCases,semanticMatch:r.semanticMatch,measurements:r.freshSplitMeasurements});
 }
 if(ids.length!==total||new Set(ids).size!==total||new Set(indexes).size!==total||!equal(perf.sort((a,b)=>a-b),[26,40,60,100,150]))throw Error('Incomplete global matrix');
 return {schema:1,...context,planDigest:plan,totalOriginalCases:total,gameplayCases:total-5,performanceCases:5,semanticMatch:ordered.every(r=>r.semanticMatch),perShard,freshMeasurements:ordered.reduce((n,r)=>n+r.freshSplitMeasurements,0),freshPerformanceRequired:true,productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
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
   const [shardArg,planPath,legacyPath,gamePath,perfPath,out]=a,p=json(planPath),shard=Number(shardArg);
   if(!equal(p.context,context)||p.plan.productionAuthorization!==false||p.plan.planDigest!==digest(p.plan.shards))throw Error('Invalid plan context');
   const phase=dir=>({report:json(join(dir,'phase.json')),records:jsonl(join(dir,'records.jsonl'))});
   const legacy={rows:jsonl(join(legacyPath,'completion-'+shard+'.jsonl')),summary:json(join(legacyPath,'completion-'+shard+'-summary.json'))};
   const report=compareLegacy(p.plan,p.version,shard,[phase(gamePath),phase(perfPath)],legacy,context);
   writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.semanticMatch)process.exitCode=1;
  }else if(mode==='aggregate'){
   if(process.env.MATRIX_RESULT!=='success')throw Error('Incomplete execution matrix');
   const [root,out]=a,names=Array.from({length:8},(_,n)=>'split-full-'+context.attempt+'-'+n);
   if(!equal(readdirSync(root).sort(),names))throw Error('Missing matrix artifacts');
   const rows=names.map((name,i)=>{const dir=join(root,name),file=join(dir,'comparison.json');if(!lstatSync(dir).isDirectory()||!equal(readdirSync(dir),['comparison.json'])||!lstatSync(file).isFile()||lstatSync(file).size>2_000_000)throw Error('Invalid artifact');const row=json(file);if(row.shard!==i)throw Error('Artifact shard mismatch');return row;});
   const report=aggregate(rows,context);writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.semanticMatch)process.exitCode=1;
  }else throw Error('Unknown mode');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
