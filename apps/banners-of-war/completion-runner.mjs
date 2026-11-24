import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {join} from 'node:path';
import {finalCases,finalTrial} from './final-integration-lab.mjs';
import {antiquityCases,antiquityTrial} from './antiquity-lab.mjs';
import {MATRIX_VERSION,originalCases,extraCases,historicalCases,runCase} from './completion-lab.mjs';
const shard=Number(process.argv[2]??0),count=Number(process.argv[3]??8),dir=process.argv[4]||process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/banners-completion';
if(!Number.isInteger(shard)||!Number.isInteger(count)||count<1||shard<0||shard>=count)throw Error('Invalid shard');
mkdirSync(dir,{recursive:true});let file=join(dir,'completion-'+shard+'.jsonl');writeFileSync(file,'');
const queue=[...originalCases().map(k=>['original',k]),...extraCases().map(k=>['independent',k]),...historicalCases().map(k=>['historical',k]),...antiquityCases().map(k=>['antiquity',k]),...finalCases().map(k=>['final-integration',k]),...[26,40,60,100,150].map(k=>['performance',k])].filter((_,i)=>i%count===shard);
let results=[];for(let [kind,k] of queue){let result=kind==='antiquity'?antiquityTrial(k):kind==='final-integration'?finalTrial(k):runCase(kind,k);let record={version:MATRIX_VERSION,kind,result};results.push(record);appendFileSync(file,JSON.stringify(record)+'\n');if(results.length%10===0)console.log('Completed',results.length,'/',queue.length)}
writeFileSync(join(dir,'completion-'+shard+'-summary.json'),JSON.stringify({version:MATRIX_VERSION,shard,count,expected:queue.length,completed:results.length,groups:Object.fromEntries(['original','independent','historical','antiquity','final-integration','performance'].map(k=>[k,results.filter(r=>r.kind===k).length]))},null,2)+'\n');
