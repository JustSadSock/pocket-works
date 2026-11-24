import {controlCases,controlTrial} from './control-lab.mjs';
import {writeFileSync} from 'node:fs';
const suite=process.argv[2]||'all',path=process.argv[3];
const cases=controlCases(suite),results=[];
for(const k of cases){const r=controlTrial(k);results.push(r);if(path)process.stderr.write(JSON.stringify({factor:r.factor,seed:r.seed,mirror:r.mirror,swap:r.swapPolicies,result:r.result,contact:r.contact})+'\n');}
const report={protocol:'paired-control-v1',suite,results};
if(path)writeFileSync(path,JSON.stringify(report,null,2)+'\n');else process.stdout.write(JSON.stringify(report,null,2)+'\n');
