// Lossless separation of original Crown reports, not a cheaper performance execution.
import {readFileSync,writeFileSync,lstatSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonical,digest} from './verified-results.mjs';
import {projectCrown} from './full-simulation-repeatability.mjs';
const flags={productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
export const REPORTS=Object.freeze(['balance-3.json','balance-8.json','balance-targeted-3.json','discovery-3.json','society-3.json','society-300-4-legacy-audit.json']);
const SINGLE='society-300-4-legacy-audit.json',eq=(a,b)=>canonical(a)===canonical(b),hash=x=>digest(canonical(x));
const fail=s=>{throw Error(s);};
const raw=p=>{const s=lstatSync(p);if(!s.isFile()||s.size>128*1024*1024)fail('Unsafe original report');return readFileSync(p);};
const json=p=>JSON.parse(raw(p));
const fileSet=(p,n)=>{if(!lstatSync(p).isDirectory()||!eq(readdirSync(p).sort(),[...n].sort()))fail('Unexpected evidence files');};
export function splitReport(name,value){
 if(!REPORTS.includes(name))fail('Unknown Crown report');
 const p=projectCrown(name,value);
 return {schema:1,name,scenarios:p.count,semantic:p.semantic,measurements:p.metrics,semanticDigest:hash(p.semantic),measurementDigest:hash(p.metrics),originalDigest:hash(value)};
}
export function rejoinReport(split){
 const {name,semantic,measurements}=split;
 if(split.schema!==1||!REPORTS.includes(name)||!Array.isArray(measurements)||!measurements.length||split.semanticDigest!==hash(semantic)||split.measurementDigest!==hash(measurements))fail('Invalid split proof');
 const value=structuredClone(semantic),root=name===SINGLE?[value]:value,seen=new Set();
 for(const row of measurements){
  if(typeof row.path!=='string'||seen.has(row.path))fail('Duplicate measurement path');
  seen.add(row.path);const parts=row.path.split('/');
  if(parts.shift()!==name||parts.length<2||parts.some(p=>!p||['__proto__','prototype','constructor'].includes(p)))fail('Invalid measurement path');
  const field=parts.pop();let target=root;
  for(const p of parts){if(target===null||typeof target!=='object'||!Object.hasOwn(target,p))fail('Unknown measurement parent');target=target[p];}
  if(!target||typeof target!=='object'||Array.isArray(target)||Object.hasOwn(target,field))fail('Measurement overlaps gameplay');
  Object.defineProperty(target,field,{value:structuredClone(row.value),writable:true,enumerable:true,configurable:true});
 }
 if(hash(value)!==split.originalDigest||!eq(splitReport(name,value),split))fail('Split reconstruction differs');
 return value;
}
export function splitBundle(dir,receipt,side){
 if(!['prior','current'].includes(side)||receipt.kind!=='crown-balance-source-receipt-v1'||receipt.measurementsPerExecution!==1638||receipt.scenarios!==18||!receipt[side]?.files)fail('Wrong original receipt');
 const files=receipt[side].files;
 fileSet(dir,['identity.json','before.json','inside.json','after.json','runtime.json','timing.json','output']);
 const key=receipt.task.key,output=join(dir,'output',key);fileSet(join(dir,'output'),[key]);fileSet(output,[...REPORTS,'result.json','console.log']);
 for(const [p,h] of Object.entries(files)){
  if(!['identity.json','before.json','inside.json','after.json','runtime.json','timing.json',...[...REPORTS,'result.json','console.log'].map(n=>'output/'+key+'/'+n)].includes(p)||digest(raw(join(dir,p)))!==h)fail('Original evidence hash differs: '+p);
 }
 if(Object.keys(files).length!==14)fail('Incomplete original file hashes');
 const identity=json(join(dir,'identity.json'));
 if(identity.run!==receipt.issuer.run||identity.attempt!==receipt.issuer.attempt||identity.controller!==receipt.issuer.controller||identity.side!==side||identity.sha!==receipt.scope[side]||!eq(identity.task,receipt.task))fail('Wrong original execution identity');
 const splits=REPORTS.map(name=>splitReport(name,json(join(output,name))));
 for(const s of splits){rejoinReport(s);if(s.semanticDigest!==receipt.semanticDigests[side==='prior'?0:1][s.name])fail('Original semantic digest differs');}
 const scenarios=splits.reduce((n,s)=>n+s.scenarios,0),count=splits.reduce((n,s)=>n+s.measurements.length,0);
 if(scenarios!==18||count!==1638)fail('Lost original measurement coverage');
 const binding={source:identity.sha,controller:identity.controller,run:identity.run,attempt:identity.attempt,side,task:receipt.task.key};
 // Historical source measurements are retained as historical only.
 return {schema:1,binding,scenarios,measurementCount:count,semantic:splits.map(({name,scenarios,semantic,semanticDigest,originalDigest})=>({name,scenarios,semantic,semanticDigest,originalDigest})),performance:splits.map(({name,measurements,measurementDigest})=>({name,measurements,measurementDigest})),originalReceiptDigest:hash(receipt),freshForFutureTarget:false,measurementPolicy:'original-full-execution-required',...flags};
}
export function verifyBundle(split,original){
 if(!eq(split,original))fail('Split bundle differs from original');
 if(split.measurementCount!==1638||split.scenarios!==18||split.freshForFutureTarget!==false)fail('Invalid measurement provenance');
 for(const [i,s] of split.semantic.entries()){
  const p=split.performance[i];if(p.name!==s.name)fail('Wrong measurement report');
  rejoinReport({schema:1,...s,...p});
 }
 return {success:true,scenarios:18,measurements:1638,source:split.binding,semanticDigest:hash(split.semantic),measurementDigest:hash(split.performance),freshForFutureTarget:false,...flags};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,root,receiptFile,side,out]=process.argv.slice(2),receipt=json(receiptFile),original=splitBundle(root,receipt,side);
  if(mode==='split')writeFileSync(out,JSON.stringify(original)+'\n',{flag:'wx'});
  else if(mode==='verify')console.log(JSON.stringify(verifyBundle(json(out),original),null,2));
  else fail('Unknown Crown performance operation');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
