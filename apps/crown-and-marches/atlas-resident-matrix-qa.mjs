import {run} from './atlas-resident-stabilization-qa.mjs';
const seed=Number(process.argv[2]);
if(!Number.isInteger(seed)||seed<0||seed>11)throw Error('Invalid Resident matrix group');
const groups=[[0,1],[2,3],[4,5],[6]];
if(seed<8)await run(seed<4?'chromium':'webkit',groups[seed%4]);
else await run(seed<10?'chromium':'webkit',[0,3],{short:true,streaming:seed%2===0?'control':'predictive'});
