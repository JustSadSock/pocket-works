// Advisory cross-runner experiment; only audited gameplay projections are compared.
import {readFileSync,writeFileSync,readdirSync,lstatSync,appendFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonical,digest} from './verified-results.mjs';
import {compareFull} from './full-simulation-repeatability.mjs';
export const IMAGE='node@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb';
export const CASES={"crown":{"sha":"1ad4c63131d2ae3a46598da963d5a6101471687b","app":"crown-and-marches","count":18},"banners":{"sha":"11c8e8411b20e8465cafcc0bad51b1f0a6cff2d1","app":"banners-of-war","count":235}};
const HEX=/^[0-9a-f]{64}$/;
const keys=(a,b)=>JSON.stringify(Object.keys(a).sort())===JSON.stringify([...b].sort());
const exact=(a,b)=>canonical(a)===canonical(b);
const files={crown:['balance-3.json','balance-8.json','balance-targeted-3.json','discovery-3.json','society-3.json','society-300-4-legacy-audit.json'],banners:['completion-0.jsonl','completion-0-summary.json']};
const crownCoverage={'balance-3.json':4,'balance-8.json':1,'balance-targeted-3.json':2,'discovery-3.json':5,'society-3.json':5,'society-300-4-legacy-audit.json':1};
const bannerCoverage={cases:235,groups:{original:126,independent:11,historical:37,antiquity:17,'final-integration':24,'numerical-superiority':19,performance:1}};
function validate(r,kind,replica,context){
 const c=CASES[kind];
 if(r?.schema!==1||r.kind!==kind||r.replica!==replica||r.source!==c.sha||r.run!==context.run||r.attempt!==context.attempt||r.auditCommit!==context.auditCommit||r.productionAuthorization!==false)throw Error('Invalid sample identity');
 if(!keys(r.environment,['image','config','node','arch','toolchain','archive','kernel','cpu','uid','gid'])||r.environment.image!==IMAGE||
  !['config','toolchain','archive'].every(k=>HEX.test(r.environment[k]))||!/^v22\.\d+\.\d+$/.test(r.environment.node)||r.environment.arch!=='x64'||
  !['kernel','cpu'].every(k=>typeof r.environment[k]==='string'&&r.environment[k].length>0&&r.environment[k].length<512)||
  !['uid','gid'].every(k=>Number.isSafeInteger(r.environment[k])&&r.environment[k]>0))throw Error('Invalid measured environment');
 if(!keys(r.semanticDigests,files[kind])||!keys(r.rawDigests,files[kind])||![...Object.values(r.semanticDigests),...Object.values(r.rawDigests)].every(s=>HEX.test(s))||
  !exact(r.coverage,kind==='crown'?crownCoverage:bannerCoverage)||!Number.isSafeInteger(r.durationMs)||r.durationMs<0||
  r.measurementCount!==(kind==='crown'?1638:432)||!HEX.test(r.measurementDigest))throw Error('Incomplete original task projection');
}
export function sample(kind,replica,env,dir,expected,context){
 // The existing full audit validates and projects the one completed directory.
 // Passing the same immutable output twice only repeats report parsing, not simulation.
 const x=compareFull(kind,dir,dir,expected);
 if(!x.semanticMatch||!x.rawMatch)throw Error('Inconsistent projection of a single task output');
 const measurements=x.freshMeasurements[0],r={schema:1,kind,replica,source:CASES[kind].sha,...context,environment:env,
  coverage:x.coverage,semanticDigests:x.semanticDigests[0],rawDigests:x.rawDigests[0],durationMs:x.durationMs[0],
  measurementCount:measurements.length,measurementDigest:digest(JSON.stringify(measurements)),productionAuthorization:false};
 validate(r,kind,replica,context);return {report:r,measurements};
}
export function compareKernel(rows,context){
 if(!Number.isSafeInteger(context.run)||context.run<1||!Number.isSafeInteger(context.attempt)||context.attempt<1||! /^[a-f0-9]{40}$/.test(context.auditCommit)||!Array.isArray(rows)||rows.length!==4)throw Error('Incomplete experiment');
 const results=[];
 for(const kind of ['crown','banners']){
  const a=rows.filter(r=>r.kind===kind&&r.replica===1),b=rows.filter(r=>r.kind===kind&&r.replica===2);
  if(a.length!==1||b.length!==1)throw Error('Missing or duplicate sample');
  const [x,y]=[a[0],b[0]];validate(x,kind,1,context);validate(y,kind,2,context);
  const changedFields=Object.keys(x.environment).sort().filter(k=>!exact(x.environment[k],y.environment[k]));
  const controlled=changedFields.every(k=>['kernel','cpu'].includes(k));
  const changedReports=files[kind].filter(k=>x.semanticDigests[k]!==y.semanticDigests[k]);
  const semanticMatch=changedReports.length===0,kernelDiverse=changedFields.includes('kernel');
  results.push({kind,source:x.source,coverage:x.coverage,scenarios:CASES[kind].count,kernels:[x.environment.kernel,y.environment.kernel],cpus:[x.environment.cpu,y.environment.cpu],
   changedFields,controlled,kernelDiverse,semanticMatch,changedReports,rawMatch:exact(x.rawDigests,y.rawDigests),durationMs:[x.durationMs,y.durationMs],
   freshMeasurementCounts:[x.measurementCount,y.measurementCount],finding:!controlled?'inconclusive-environment':!semanticMatch?'semantic-mismatch':!kernelDiverse?'inconclusive-same-kernel':'observed-cross-kernel-match'});
 }
 return {schema:1,results,decision:'execute',productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
}
const json=p=>JSON.parse(readFileSync(p,'utf8'));
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,...a]=process.argv.slice(2);
  const context={run:Number(process.env.GITHUB_RUN_ID),attempt:Number(process.env.GITHUB_RUN_ATTEMPT),auditCommit:process.env.GITHUB_SHA};
  if(mode==='sample'){
   const [kind,replica,env,dir,plan,out]=a;
   const r=sample(kind,Number(replica),json(env),dir,kind==='banners'?json(plan):null,context);
   writeFileSync(join(out,'sample.json'),JSON.stringify(r.report,null,2)+'\n');
   writeFileSync(join(out,'measurements.json'),JSON.stringify(r.measurements)+'\n');
   console.log(JSON.stringify(r.report,null,2));
  }else if(mode==='compare'){
   if(process.env.MATRIX_RESULT!=='success')throw Error('Incomplete execution matrix');
   const [root,out]=a,names=['banners','crown'].flatMap(k=>[1,2].map(n=>'kernel-'+k+'-'+n+'-'+context.attempt));
   if(!exact(readdirSync(root).sort(),names.sort()))throw Error('Unexpected artifact coverage');
   const rows=names.map(n=>{
    const dir=join(root,n);
    if(!lstatSync(dir).isDirectory()||!exact(readdirSync(dir).sort(),['measurements.json','sample.json']))throw Error('Unexpected artifact content');
    for(const f of ['sample.json','measurements.json']){const s=lstatSync(join(dir,f));if(!s.isFile()||s.size>2_000_000)throw Error('Unsafe artifact');}
    const r=json(join(dir,'sample.json')),m=json(join(dir,'measurements.json'));
    if(!Array.isArray(m)||m.length!==r.measurementCount||digest(JSON.stringify(m))!==r.measurementDigest||n!=='kernel-'+r.kind+'-'+r.replica+'-'+context.attempt)throw Error('Artifact measurement or identity mismatch');
    return r;
   });
   const report=compareKernel(rows,context),s=JSON.stringify(report,null,2);
   writeFileSync(out,s+'\n');console.log(s);
   if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## Cross-kernel simulation audit\n\n~~~json\n'+s+'\n~~~\n');
   if(report.results.some(r=>!r.semanticMatch))process.exitCode=1;
  }else throw Error('Unknown command');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
