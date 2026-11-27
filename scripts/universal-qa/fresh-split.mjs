// Fresh-only split adapter. It preserves the original Universal QA task ID,
// timeout and report schema; it never consults historical results.
import {readFileSync,lstatSync,mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {loadOriginal,runPhase,combine,projectShard} from '../ci-overhaul/simulation-performance-contracts.mjs';
import {ROOT,loadSuites,resolveTasks} from './plan.mjs';
import {selectVerifiedShadow,assembleVerifiedShadow} from './verified-split.mjs';
export const AUDITED_PLAN='81f618b94fadc8e1bd96ff66a339528c55b768e72ac50767ada94de409e2ee25';
export const PRODUCERS=Object.freeze({
 'completion-runner.mjs':'db22d10f4087822ff756c1964bdd198a5e081092',
 'completion-lab.mjs':'f945f5f65d2d6acbc46eee56c19837a02712b162',
 'commander-lab.mjs':'e1130d13a1eb4a8af190565047e6233718cdc046',
 'numbers-lab.mjs':'d864becb144d3d214ee5274b4dcd63bb2aeb01e9',
 'antiquity-lab.mjs':'1a8830c9c5e1a2b4f353cc1c24fe0bff99196736',
 'final-integration-lab.mjs':'78022399e599cf2f034cc9c2045a8ae12379b09b'
});
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function matchesTask(task,suite){
 return task?.app==='banners-of-war'&&task.suite==='completion-lab'&&task.kind==='node'&&task.install===false&&
  Number.isInteger(task.seed)&&task.seed>=0&&task.seed<8&&task.key==='banners-of-war-completion-lab-'+task.seed&&
  suite?.id==='completion-lab'&&suite.kind==='node'&&suite.entry==='completion-runner.mjs'&&
  equal(suite.args,['{seed}','8','{output}'])&&equal(suite.seeds,[0,1,2,3,4,5,6,7])&&
  suite.tier==='smoke'&&(suite.install===undefined||suite.install===false)&&
  Object.keys(suite).every(k=>['id','kind','entry','args','seeds','tier','install'].includes(k));
}
export function producerMatch(root){
 try{
  for(const [name,expected] of Object.entries(PRODUCERS)){
   const file=join(root,'apps/banners-of-war',name),stat=lstatSync(file);
   if(!stat.isFile()||stat.size>1_000_000)return false;
   const b=readFileSync(file),hash=createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
   if(hash!==expected)return false;
  }
  return true;
 }catch{return false;}
}
export function selectSplit(root,task,suite,mode=process.env.PW_QA_SPLIT_BANNERS??'1'){
 return mode==='1'&&matchesTask(task,suite)&&producerMatch(root);
}
function checkPlan(original){
 return original.version==='chronicles-completion-v1'&&original.plan.planDigest===AUDITED_PLAN&&original.plan.total===1873;
}
function launch(args,{binary=process.execPath,allowFallback=false}={}){
 return new Promise((done,reject)=>{
  const child=spawn(binary,args,{cwd:ROOT,stdio:'inherit',shell:false});
  const terminate=signal=>{child.kill(signal);process.exit(signal==='SIGINT'?130:143);};
  const onTerm=()=>terminate('SIGTERM'),onInt=()=>terminate('SIGINT');
  process.once('SIGTERM',onTerm);process.once('SIGINT',onInt);
  const cleanup=()=>{process.removeListener('SIGTERM',onTerm);process.removeListener('SIGINT',onInt);};
  child.once('error',e=>{cleanup();reject(e);});
  child.once('close',(code,signal)=>{cleanup();if(code===0&&!signal)done(0);else if(allowFallback&&code===75&&!signal)done(75);else reject(Error('Fresh child failed: '+code+' '+(signal??'')));});
 });
}
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const jsonl=p=>{const s=readFileSync(p,'utf8').trim();return s?s.split('\n').map(JSON.parse):[];};
export function assemble(original,shard,phases,context,output){
 const {plan,version}=original,combined=combine(plan,version,shard,phases,context);
 const expected=plan.shards[shard].gameplay.concat(plan.shards[shard].performance).sort((a,b)=>a.index-b.index).map(r=>r.kind);
 const projected=projectShard(combined.rows,combined.summary,expected,shard);
 const report={schema:1,mode:'fresh-split-v1',planDigest:plan.planDigest,shard,gameplayCases:plan.shards[shard].gameplay.length,
  performanceCases:plan.shards[shard].performance.length,performanceSizes:plan.shards[shard].performance.map(r=>r.value),
  freshMeasurements:projected.metrics.length,phases:phases.map(p=>p.report),reused:false,allowResultReuse:false,allowImpactSkipping:false};
 writeFileSync(join(output,'completion-'+shard+'.jsonl'),combined.rows.map(r=>JSON.stringify(r)+'\n').join(''),{flag:'wx'});
 writeFileSync(join(output,'completion-'+shard+'-summary.json'),JSON.stringify(combined.summary,null,2)+'\n',{flag:'wx'});
 writeFileSync(join(output,'split-contract.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(report));return report;
}
async function main(){
 const [mode,seed,output,phase,rawContext]=process.argv.slice(2),shard=Number(seed);
 if(!Number.isInteger(shard)||shard<0||shard>=8||!output)throw Error('Invalid split invocation');
 const task=resolveTasks(ROOT,{apps:['banners-of-war'],suite:'completion-lab',profile:'deep'}).find(t=>t.seed===shard);
 const suite=loadSuites(ROOT,'banners-of-war').find(s=>s.id==='completion-lab');
 if(!selectSplit(ROOT,task,suite))throw Error('Unapproved split contract');
 const original=await loadOriginal(ROOT);
 if(mode==='phase'){
  if(!checkPlan(original)||!['gameplay','performance'].includes(phase))throw Error('Fresh phase contract changed');
  const context=JSON.parse(rawContext);
  if(typeof context?.run!=='string'||context.run.length!==36||context.source!==AUDITED_PLAN||context.attempt!==1||context.auditCommit!==AUDITED_PLAN)throw Error('Invalid phase context');
  runPhase(original,shard,phase,output,context);return;
 }
 if(mode!=='run')throw Error('Unknown split mode');
 if(!checkPlan(original)){
  // Before any new execution, return to the untouched app-owned original.
  console.log('Split plan differs; executing original Banners completion runner');
  await launch([join(ROOT,'apps/banners-of-war/completion-runner.mjs'),seed,'8',output]);return;
 }
 if(selectVerifiedShadow(process.env)){
  const temp=mkdtempSync(join(tmpdir(),'pw-verified-split-'));
  try{
   const exit=await launch([join(ROOT,'scripts/universal-qa/verified-split-shadow.sh'),String(shard),temp],{binary:'bash',allowFallback:true});
   if(exit===0){assembleVerifiedShadow(original,shard,temp,process.env.PW_QA_VERIFIED_EVIDENCE,output);return;}
   console.log('Verified shadow preflight declined; running ordinary fresh split');
  }finally{rmSync(temp,{recursive:true,force:true});}
 }
 const temp=mkdtempSync(join(tmpdir(),'pw-fresh-split-')),context={source:AUDITED_PLAN,run:randomUUID(),attempt:1,auditCommit:AUDITED_PLAN};
 try{
  const phases=[];
  for(const name of ['gameplay','performance']){
   const dir=join(temp,name);mkdirSync(dir);
   await launch([fileURLToPath(import.meta.url),'phase',seed,dir,name,JSON.stringify(context)]);
   phases.push({report:json(join(dir,'phase.json')),records:jsonl(join(dir,'records.jsonl'))});
  }
  assemble(original,shard,phases,context,output);
 }finally{rmSync(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e);process.exitCode=1;});
