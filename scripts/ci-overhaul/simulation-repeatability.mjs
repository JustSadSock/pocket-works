// Advisory audit of actual application report outputs. Never authorizes reuse.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
function canonical(x){
 if(x===null||typeof x==='string'||typeof x==='boolean')return x;
 if(typeof x==='number'&&Number.isFinite(x))return x;
 if(Array.isArray(x))return x.map(canonical);
 if(plain(x))return Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]));
 throw Error('Unsupported report value');
}
export function project(kind,rows){
 if(!Array.isArray(rows)||rows.length!==2||rows.some(x=>!plain(x)))throw Error('Expected exactly two complete scenarios');
 const timing=[],semantics=[];
 for(const row of rows){
  let keys;
  if(kind==='crown'){
   if(typeof row.name!=='string'||typeof row.seed!=='string'||row.days!==1800||
     !Array.isArray(row.samples)||row.samples.length!==5||!Array.isArray(row.wars)||
     !Array.isArray(row.initialPower)||!Array.isArray(row.finalPower)||!plain(row.stats))
    throw Error('Incomplete Crown scenario');
   keys=['ms'];
  }else if(kind==='banners'){
   if(typeof row.id!=='string'||typeof row.series!=='string'||!Number.isInteger(row.seed)||
     !plain(row.final)||!Array.isArray(row.trajectory)||!row.trajectory.length||
     !Object.hasOwn(row,'result')||!Object.hasOwn(row,'resultReason'))
    throw Error('Incomplete Banners scenario');
   keys=['plannerMs','physicsMs'];
  }else throw Error('Unknown audit');
  const metrics=Object.fromEntries(keys.map(k=>{
   if(typeof row[k]!=='number'||!Number.isFinite(row[k])||row[k]<0)throw Error('Invalid timing field: '+k);
   return [k,row[k]];
  }));
  timing.push(metrics);
  // Exclude only audited top-level wall-clock measurements; never remove
  // nested gameplay fields, simulated time, events or ordering.
  semantics.push(canonical(Object.fromEntries(Object.entries(row).filter(([k])=>!keys.includes(k)))));
 }
 const identities=semantics.map(r=>kind==='crown'?JSON.stringify([r.name,r.seed]):JSON.stringify([r.id,r.series,r.seed,r.repeat]));
 if(new Set(identities).size!==2)throw Error('Duplicate scenario identity');
 if(kind==='crown'&&(semantics[0].name!=='regional-growth'||semantics[1].name!=='regional-overseas'))
  throw Error('Unexpected Crown scenario identity');
 return {digest:hash(semantics),fullDigest:hash(canonical(rows)),timing,identities};
}
export function compare(kind,a,b){
 const x=project(kind,a),y=project(kind,b);
 if(JSON.stringify(x.identities)!==JSON.stringify(y.identities))throw Error('Scenario identity mismatch');
 return {schema:1,kind,scenarios:x.identities,semanticMatch:x.digest===y.digest,rawMatch:x.fullDigest===y.fullDigest,
  digests:[x.digest,y.digest],measurements:[x.timing,y.timing],decision:'execute',reuse:false,canSkip:false,productionAuthorization:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [kind,a,b,out]=process.argv.slice(2);
  const report=compare(kind,JSON.parse(readFileSync(a,'utf8')),JSON.parse(readFileSync(b,'utf8')));
  const json=JSON.stringify(report,null,2);
  if(out)writeFileSync(out,json+'\n');
  console.log(json);
  if(!report.semanticMatch)process.exitCode=1;
 }catch(e){console.error(e.message);process.exitCode=1;}
}
