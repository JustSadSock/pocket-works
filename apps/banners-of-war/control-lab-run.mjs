import {controlCases,controlTrial} from './control-lab.mjs';
import {readFileSync,readdirSync,writeFileSync,renameSync,existsSync,statSync} from 'node:fs';
import {join} from 'node:path';
const suite=process.argv[2]||'all',output=process.argv[3];
const path=output&&existsSync(output)&&statSync(output).isDirectory()?join(output,'control-v2-results.json'):output;
const protocol='paired-control-v2',engineCommit='8ce73ccc09880eefe53b1e69028c5cb0c2fe6f7d';
const key=k=>JSON.stringify([k.factor,k.suite,k.seed,k.mirror,k.swapPolicies,k.seconds]);
const all=controlCases(),valid=new Set(all.map(key)),archive=new Map();
const folder=new URL('./research/control-v2/',import.meta.url);
for(const file of readdirSync(folder).filter(f=>/^cases-\d+-\d+\.json$/.test(f))){
 const a=JSON.parse(readFileSync(new URL(file,folder),'utf8'));
 if(a.protocol!==protocol||a.engineCommit!==engineCommit||a.errors.length)throw Error('wrong archive '+file);
 for(const r of a.results){const k=key(r);if(!valid.has(k)||archive.has(k)||!Array.isArray(r.initialPositions)||!Number.isFinite(r.contact)||!r.reason||r.physics!==2)throw Error('invalid archived case '+k);archive.set(k,r)}
}
const shard=/^shard:(\d+):(\d+)$/.exec(suite);
let cases=shard?all:controlCases(suite);
if(shard){const i=Number(shard[1]),n=Number(shard[2]);if(n<1||i>=n)throw Error('invalid shard');cases=cases.filter((_,j)=>j%n===i);}
const results=[],errors=[];let reused=0;
const report=()=>({protocol,engineCommit,suite,reused,results,errors});
function checkpoint(){if(path){writeFileSync(path+'.tmp',JSON.stringify(report(),null,2)+'\n');renameSync(path+'.tmp',path)}}
for(const k of cases){
 try{const cached=archive.get(key(k)),r=cached||controlTrial(k);if(cached)reused++;results.push(r);if(path&&!cached)process.stdout.write('CONTROL_V2_CASE '+JSON.stringify(r)+'\n');}
 catch(e){errors.push({case:k,error:String(e)});}
 checkpoint();
}
if(path){checkpoint();console.log('CONTROL_V2_SUMMARY '+JSON.stringify({suite,reused,completed:results.length,errors:errors.length}));}else process.stdout.write(JSON.stringify(report(),null,2)+'\n');
if(errors.length)process.exitCode=1;
