// Full original-task report audit; never a delivery or cache authorization.
import {lstatSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const sha=x=>createHash('sha256').update(x).digest('hex');
function canonical(x){
 if(x===null||typeof x==='string'||typeof x==='boolean')return x;
 if(typeof x==='number'&&Number.isFinite(x))return x;
 if(Array.isArray(x))return x.map(canonical);
 if(plain(x))return Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]));
 throw Error('Non-JSON report value');
}
const digest=x=>sha(JSON.stringify(canonical(x)));
const measure=(v,location)=>{
 if(typeof v==='number'&&Number.isFinite(v))return v;
 if(plain(v)&&Object.values(v).every(x=>typeof x==='number'&&Number.isFinite(x)))return v;
 // A missing or invalid runtime metric must not disappear silently.
 throw Error('Invalid runtime measurement at '+location);
};
const remove=(row,keys,path,metrics)=>{
 if(!plain(row))throw Error('Invalid report object: '+path);
 const out={...row};
 for(const key of keys){
  if(!Object.hasOwn(out,key))throw Error('Missing runtime metric: '+path+'/'+key);
  metrics.push({path:path+'/'+key,value:measure(out[key],path+'/'+key)});
  delete out[key];
 }
 return out;
};
const CROWN={
 'balance-3.json':{kind:'balance',count:4,seeds:['balance-20-13','balance-20-14','balance-20-15','balance-20-16']},
 'balance-8.json':{kind:'balance',count:1,seeds:['balance-50-4']},
 'balance-targeted-3.json':{kind:'targeted',count:2,seeds:['balance-20-2','balance-20-2']},
 'discovery-3.json':{kind:'discovery',count:5,seeds:['discovery-50-13','discovery-50-14','discovery-50-15','discovery-50-16','discovery-200-4']},
 'society-3.json':{kind:'society',count:5,seeds:['society-300-4','society-100-16','society-100-15','society-100-14','society-100-13']},
 'society-300-4-legacy-audit.json':{kind:'society',count:1,seeds:['society-300-4'],single:true}
};
const TASKS={crown:{key:'crown-and-marches-balance-experiments-3',app:'crown-and-marches',suite:'balance-experiments',kind:'node',seed:3,install:false},
 banners:{key:'banners-of-war-completion-lab-0',app:'banners-of-war',suite:'completion-lab',kind:'node',seed:0,install:false}};
function crownRow(row,kind,path,metrics){
 const fields={balance:['phaseP95','wallMs','peakHeap','retainedHeapDelta','stepP95','reviewP95','diplomacyP95'],
  targeted:['ms'],discovery:['ms','peakHeap','retainedHeapDelta','tickP95','phaseP95'],
  society:['ms','peakHeap','retainedHeapDelta','tickP95','reviewP95']};
 const out=remove(row,fields[kind],path,metrics);
 if(!Array.isArray(out.samples)||!out.samples.length)throw Error('Missing samples: '+path);
 if(kind!=='targeted'){
  if(!Number.isSafeInteger(out.years)||out.years<1||out.samples.length!==out.years+(kind==='society'?1:0))
   throw Error('Incomplete years: '+path);
  out.samples=out.samples.map((s,i)=>kind==='society'&&i===0?s:remove(s,['heap'],path+'/samples/'+i,metrics));
  if(kind==='society'||kind==='discovery'){
   if(!plain(out.first)||!plain(out.last))throw Error('Missing endpoints: '+path);
   if(kind==='discovery')out.first=remove(out.first,['heap'],path+'/first',metrics);
   out.last=remove(out.last,['heap'],path+'/last',metrics);
  }
 }else if(out.days!==1800||out.samples.length!==5)throw Error('Incomplete targeted scenario');
 return out;
}
export function projectCrown(name,data){
 const spec=CROWN[name];if(!spec)throw Error('Unknown Crown report: '+name);
 const rows=spec.single?[data]:data;
 if(!Array.isArray(rows)||rows.length!==spec.count)throw Error('Wrong Crown coverage: '+name);
 const metrics=[],semantics=rows.map((r,i)=>{
  const seed=spec.kind==='society'?r.config?.seed:r.seed;
  if(seed!==spec.seeds[i])throw Error('Unexpected Crown seed: '+name+'/'+i);
  if(spec.kind==='targeted'&&r.name!==['coercive-subjugation','independence'][i])throw Error('Unexpected targeted case');
  if(spec.single&&(r.config?.circulation!==false||r.config?.institutionalReforms!==false))throw Error('Missing baseline contract');
  return crownRow(r,spec.kind,name+'/'+i,metrics);
 });
 return {semantic:spec.single?semantics[0]:semantics,metrics,count:rows.length};
}
export function projectBanners(rows,summary,expected){
 if(!Array.isArray(rows)||!Array.isArray(expected)||!expected.length||rows.length!==expected.length||
  !plain(summary)||summary.version!=='chronicles-completion-v1'||summary.shard!==0||summary.count!==8||
  summary.expected!==expected.length||summary.completed!==expected.length)
  throw Error('Incomplete Banners matrix');
 const allowed=['original','independent','historical','antiquity','final-integration','numerical-superiority','performance'];
 const groups=Object.fromEntries(allowed.map(k=>[k,expected.filter(x=>x===k).length]));
 if(digest(groups)!==digest(summary.groups))throw Error('Banners group coverage mismatch');
 const metrics=[],semantic=rows.map((row,i)=>{
  if(!plain(row)||row.version!==summary.version||row.kind!==expected[i]||!allowed.includes(row.kind)||!plain(row.result))
   throw Error('Banners case mismatch: '+i);
  const fields=row.kind==='numerical-superiority'?[]:row.kind==='historical'||row.kind==='performance'?['plannerMs','physicsMs']:['planMs','physicsMs'];
  return {...row,result:remove(row.result,fields,'completion/'+i+'/result',metrics)};
 });
 return {semantic,metrics,count:rows.length,groups};
}
function load(dir,name){
 const file=join(dir,name),s=lstatSync(file);
 if(!s.isFile()||s.isSymbolicLink()||s.size>128*1024*1024)throw Error('Unsafe report: '+name);
 const raw=readFileSync(file);
 return {raw,digest:sha(raw),data:name.endsWith('.jsonl')?raw.toString('utf8').trim().split('\n').map(x=>JSON.parse(x)):JSON.parse(raw)};
}
export function readRun(kind,dir,expected){
 const task=TASKS[kind];if(!task)throw Error('Unknown task');
 const files=kind==='crown'?Object.keys(CROWN):['completion-0.jsonl','completion-0-summary.json'];
 const actual=readdirSync(dir).sort(),needed=[...files,'console.log','result.json'].sort();
 if(JSON.stringify(actual)!==JSON.stringify(needed))throw Error('Unexpected or missing output files: '+actual.join(', '));
 const evidence=load(dir,'result.json').data;
 if(evidence.schema!==1||evidence.success!==true||evidence.exitCode!==0||evidence.signal!==null||evidence.timedOut!==false||evidence.error||
  digest(Object.fromEntries(Object.keys(task).map(k=>[k,evidence[k]])))!==digest(task)||
  !Number.isSafeInteger(evidence.durationMs)||evidence.durationMs<0)throw Error('Original task evidence invalid');
 const raw={},semantics={},measurements=[],coverage={};
 if(kind==='crown'){
  for(const file of files){
   const report=load(dir,file),p=projectCrown(file,report.data);
   raw[file]=report.digest;semantics[file]=digest(p.semantic);measurements.push(...p.metrics);coverage[file]=p.count;
  }
 }else{
  const report=load(dir,files[0]),summary=load(dir,files[1]),p=projectBanners(report.data,summary.data,expected);
  raw[files[0]]=report.digest;raw[files[1]]=summary.digest;semantics[files[0]]=digest(p.semantic);semantics[files[1]]=digest(summary.data);measurements.push(...p.metrics);coverage.groups=p.groups;coverage.cases=p.count;
 }
 return {raw,semantics,measurements,coverage,durationMs:evidence.durationMs};
}
export function compareFull(kind,a,b,expected){
 const x=readRun(kind,a,expected),y=readRun(kind,b,expected);
 const changed=Object.keys(x.semantics).filter(k=>x.semantics[k]!==y.semantics[k]);
 return {schema:1,kind,task:TASKS[kind],coverage:x.coverage,semanticMatch:changed.length===0,changed,
  rawMatch:digest(x.raw)===digest(y.raw),semanticDigests:[x.semantics,y.semantics],rawDigests:[x.raw,y.raw],
  durationMs:[x.durationMs,y.durationMs],freshMeasurements:[x.measurements,y.measurements],
  decision:'execute',reuse:false,canSkip:false,productionAuthorization:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [kind,a,b,expectedPath,out]=process.argv.slice(2);
  const r=compareFull(kind,a,b,kind==='banners'?JSON.parse(readFileSync(expectedPath,'utf8')):null);
  writeFileSync(out,JSON.stringify(r,null,2)+'\n');
  const {freshMeasurements,...summary}=r;
  console.log(JSON.stringify({...summary,measurementCounts:freshMeasurements.map(x=>x.length)},null,2));
  if(!r.semanticMatch)process.exitCode=1;
 }catch(e){console.error(e.message);process.exitCode=1;}
}
