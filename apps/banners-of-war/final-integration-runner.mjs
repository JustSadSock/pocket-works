import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {join} from 'node:path';
import {finalCases,finalTrial} from './final-integration-lab.mjs';
const shard=Number(process.argv[2]??0),count=Number(process.argv[3]??12),dir=process.argv[4]||process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/banners-final';
if(!Number.isInteger(shard)||!Number.isInteger(count)||count<1||shard<0||shard>=count)throw Error('Invalid shard');mkdirSync(dir,{recursive:true});let path=join(dir,'final-'+shard+'.jsonl'),queue=finalCases().filter((_,i)=>i%count===shard);writeFileSync(path,'');let done=0;for(let k of queue){let r=finalTrial(k);appendFileSync(path,JSON.stringify(r)+'\n');console.log('Final integration',++done,'/',queue.length,k.kind,k.id,k.strategy||k.variant||k.physics,r.result,r.reason)}writeFileSync(join(dir,'summary-'+shard+'.json'),JSON.stringify({expected:queue.length,completed:done},null,2));
