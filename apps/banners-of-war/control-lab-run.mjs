import {controlCases,controlTrial} from './control-lab.mjs';
import {writeFileSync} from 'node:fs';
const suite=process.argv[2]||'all',path=process.argv[3];
const shard=/^shard:(\d+):(\d+)$/.exec(suite);
let cases=shard?controlCases():controlCases(suite);
if(shard){const i=Number(shard[1]),n=Number(shard[2]);if(n<1||i>=n)throw Error('invalid shard');cases=cases.filter((_,j)=>j%n===i);}
const results=[],errors=[];
for(const k of cases){
 try{const r=controlTrial(k);results.push(r);if(path)process.stderr.write(JSON.stringify({factor:r.factor,seed:r.seed,mirror:r.mirror,swap:r.swapPolicies,result:r.result,contact:r.contact})+'\n');}
 catch(e){errors.push({case:k,error:String(e)});}
}
const report={protocol:'paired-control-v2',suite,results,errors};
if(path)writeFileSync(path,JSON.stringify(report,null,2)+'\n');else process.stdout.write(JSON.stringify(report,null,2)+'\n');
if(errors.length)process.exitCode=1;
