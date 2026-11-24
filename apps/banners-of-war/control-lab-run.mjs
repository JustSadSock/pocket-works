import {controlCases,controlTrial} from './control-lab.mjs';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
const suite=process.argv[2]||'all',path=process.argv[3];
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
for(const k of cases){
 try{const cached=archive.get(key(k)),r=cached||controlTrial(k);if(cached)reused++;results.push(r);if(path)process.stderr.write(JSON.stringify({factor:r.factor,seed:r.seed,mirror:r.mirror,swap:r.swapPolicies,result:r.result,contact:r.contact,reused:!!cached})+'\n');}
 catch(e){errors.push({case:k,error:String(e)});}
}
const report={protocol,engineCommit,suite,reused,results,errors};
if(path)writeFileSync(path,JSON.stringify(report,null,2)+'\n');else process.stdout.write(JSON.stringify(report,null,2)+'\n');
if(errors.length)process.exitCode=1;
