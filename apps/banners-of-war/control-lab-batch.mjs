// App-specific bounded research workload: one Universal QA slot, six durable shards.
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const output=process.argv[2];if(!output)throw Error('output directory required');
mkdirSync(output,{recursive:true});
const runner=fileURLToPath(new URL('./control-lab-run.mjs',import.meta.url));
let cursor=0,failures=[];
async function shard(i){
 const dest=join(output,'shard-'+i);mkdirSync(dest,{recursive:true});
 await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[runner,'shard:'+i+':6',dest],{stdio:'inherit'});
  child.once('error',reject);child.once('exit',(code,signal)=>code===0?resolve():reject(Error('shard '+i+' exited '+code+'/'+signal)));
 });
}
await Promise.all(Array.from({length:2},async()=>{while(cursor<6){let i=cursor++;try{await shard(i)}catch(e){failures.push(String(e))}}}));
if(failures.length)throw Error(failures.join('; '));
const summary=fileURLToPath(new URL('./control-lab-summary.mjs',import.meta.url));
await new Promise((resolve,reject)=>{let child=spawn(process.execPath,[summary,output],{stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('aggregate failed '+code)))});
