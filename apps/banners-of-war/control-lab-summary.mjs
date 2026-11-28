// Aggregate only exact v2 baseline results; use archived chunks and shard files.
import {controlCases} from './control-lab.mjs';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
const protocol='paired-control-v2',engineCommit='8ce73ccc09880eefe53b1e69028c5cb0c2fe6f7d';
const key=k=>JSON.stringify([k.factor,k.suite,k.seed,k.mirror,k.swapPolicies,k.seconds]);
const all=controlCases(),expected=new Set(all.map(key)),seen=new Map();
function files(path){return statSync(path).isDirectory()?readdirSync(path).flatMap(p=>files(join(path,p))):[path]}
for(const root of process.argv.slice(2))for(const path of files(root)){
 if(!/(?:cases-\d+-\d+|control-v2-results)\.json$/.test(path))continue;
 const r=JSON.parse(readFileSync(path,'utf8'));
 if(r.protocol!==protocol||r.engineCommit!==engineCommit||r.errors.length)throw Error('wrong protocol or failed shard: '+path);
 for(const v of r.results){
  let k=key(v);if(!expected.has(k)||v.physics!==2||!v.reason||!Array.isArray(v.initialPositions)||!Number.isFinite(v.contact))throw Error('invalid result '+k);
  if(seen.has(k)&&JSON.stringify(seen.get(k))!==JSON.stringify(v))throw Error('conflicting duplicate '+k);
  seen.set(k,v)
 }
}
const missing=all.filter(k=>!seen.has(key(k))),groups={};
for(const r of seen.values()){
 const g=groups[r.factor]??={trials:0,reference:0,challenger:0,draw:0,noContact:0,contactSeconds:0,reasons:{},policyWins:{legacy:0,modern:0,draw:0}};
 g.trials++;g[r.result]++;g.noContact+=r.contact===0?1:0;g.contactSeconds+=r.contact;g.reasons[r.reason]=(g.reasons[r.reason]||0)+1;
 if(r.referencePolicy.version!==r.challengerPolicy.version){const winner=r.result==='draw'?null:r.result==='reference'?r.referencePolicy:r.challengerPolicy;g.policyWins[winner===null?'draw':winner.version===3?'legacy':'modern']++}
}
console.log(JSON.stringify({protocol,engineCommit,completed:seen.size,expected:all.length,groups,missing},null,2));
if(missing.length)process.exitCode=1;
