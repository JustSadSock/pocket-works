// Bounded diagnostic only. Never authorizes historical delivery.
import {readFileSync,readdirSync,writeFileSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {project} from './simulation-repeatability.mjs';
import {canonical} from './verified-results.mjs';
export const SOURCE='f253a6e1d81d9f831e8b95b6e508d854a395e5fe';
export const IMAGE='node@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb';
const hex=/^[0-9a-f]{64}$/;
const equal=(a,b)=>canonical(a)===canonical(b);
export function compareProbes(samples,context){
 if(!Array.isArray(samples)||samples.length!==4||!Number.isSafeInteger(context.run)||context.run<1||!Number.isSafeInteger(context.attempt)||context.attempt<1||!/^[a-f0-9]{40}$/.test(context.commit))throw Error('Incomplete probe context');
 const seen=new Set();
 for(const s of samples){
  if(s.schema!==1||s.source!==SOURCE||s.run!==context.run||s.attempt!==context.attempt||s.commit!==context.commit||s.productionAuthorization!==false||![1,2,3,4].includes(s.replica)||seen.has(s.replica))throw Error('Unexpected probe identity');
  seen.add(s.replica);
  const e=s.environment;
  if(!e||!equal(Object.keys(e).sort(),['arch','archive','config','cpu','gid','image','kernel','node','toolchain','uid'])||e.image!==IMAGE||e.arch!=='x64'||!/^v22\.\d+\.\d+$/.test(e.node)||!['archive','config','toolchain'].every(k=>hex.test(e[k]))||!['kernel','cpu'].every(k=>typeof e[k]==='string'&&e[k].length>0&&e[k].length<512)||![e.uid,e.gid].every(n=>Number.isSafeInteger(n)&&n>0))throw Error('Invalid environment');
  if(!hex.test(s.projection.digest)||!hex.test(s.projection.fullDigest)||!Array.isArray(s.projection.identities)||s.projection.identities.length!==2||!Array.isArray(s.projection.timing)||s.projection.timing.length!==2||!s.projection.timing.every(t=>Number.isFinite(t.ms)&&t.ms>=0))throw Error('Invalid gameplay projection');
 }
 samples=[...samples].sort((a,b)=>a.replica-b.replica);
 const pairs=[];
 for(let i=0;i<samples.length;i++)for(let j=i+1;j<samples.length;j++){
  const a=samples[i],b=samples[j],changed=Object.keys(a.environment).sort().filter(k=>!equal(a.environment[k],b.environment[k]));
  pairs.push({replicas:[a.replica,b.replica],changed,controlled:changed.every(k=>['kernel','cpu'].includes(k)),differentKernel:changed.includes('kernel'),sameGameplay:a.projection.digest===b.projection.digest&&equal(a.projection.identities,b.projection.identities)});
 }
 const eligible=pairs.filter(p=>p.controlled&&p.differentKernel),sameGameplay=pairs.every(p=>p.sameGameplay);
 return {schema:1,scenarios:8,kernels:[...new Set(samples.map(s=>s.environment.kernel))],cpus:[...new Set(samples.map(s=>s.environment.cpu))],pairs,eligiblePairs:eligible.length,sameGameplay,finding:!sameGameplay?'semantic-mismatch':eligible.length?'observed-targeted-cross-kernel-match':'inconclusive',productionAuthorization:false,allowResultReuse:false};
}
const json=p=>JSON.parse(readFileSync(p,'utf8'));
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,...a]=process.argv.slice(2),context={run:Number(process.env.GITHUB_RUN_ID),attempt:Number(process.env.GITHUB_RUN_ATTEMPT),commit:process.env.GITHUB_SHA};
  if(mode==='sample'){
   const [replica,env,report,out]=a;
   const s={schema:1,source:SOURCE,...context,replica:Number(replica),environment:json(env),projection:project('crown',json(report)),productionAuthorization:false};
   writeFileSync(out,JSON.stringify(s,null,2)+'\n');console.log(JSON.stringify(s,null,2));
  }else if(mode==='compare'){
   if(process.env.MATRIX_RESULT!=='success')throw Error('Incomplete matrix');
   const [root,out]=a,names=[1,2,3,4].map(n=>'crown-kernel-probe-'+context.attempt+'-'+n);
   if(!equal(readdirSync(root).sort(),names))throw Error('Unexpected artifact coverage');
   const rows=names.map((n,i)=>{const d=join(root,n),p=join(d,'sample.json');if(!lstatSync(d).isDirectory()||!equal(readdirSync(d),['sample.json'])||!lstatSync(p).isFile()||lstatSync(p).size>200000)throw Error('Invalid artifact');const s=json(p);if(s.replica!==i+1)throw Error('Artifact identity mismatch');return s;});
   const r=compareProbes(rows,context);writeFileSync(out,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r,null,2));if(!r.sameGameplay)process.exitCode=1;
  }else throw Error('Unknown mode');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
