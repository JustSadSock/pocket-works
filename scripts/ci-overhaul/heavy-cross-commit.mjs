// Qualification only. A controlled out-of-scope commit is not a real application release.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,readdirSync,lstatSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonical,digest} from './verified-results.mjs';
import {compareScope,normalizeSnapshot,scopeRoots} from './universal-cross-commit.mjs';
import {compareFull} from './full-simulation-repeatability.mjs';
import {validateRuntime} from './universal-signed-receipts.mjs';
import {economicDecision} from './universal-reuse-economics.mjs';
const flags={productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
const SHA=/^[a-f0-9]{40}$/,eq=(a,b)=>canonical(a)===canonical(b),fail=s=>{throw Error(s);};
export const CASES=Object.freeze({
 banners:Object.freeze({app:'banners-of-war',source:'11c8e8411b20e8465cafcc0bad51b1f0a6cff2d1',task:{key:'banners-of-war-completion-lab-0',app:'banners-of-war',suite:'completion-lab',kind:'node',seed:0,install:false},count:235,measurements:432}),
 crown:Object.freeze({app:'crown-and-marches',source:'e44862dac566e9ef7c5537f0de26e58df8cebb35',task:{key:'crown-and-marches-balance-experiments-3',app:'crown-and-marches',suite:'balance-experiments',kind:'node',seed:3,install:false},count:18,measurements:1638})
});
const git=(repo,args,opts={})=>execFileSync('git',args,{cwd:repo,maxBuffer:70*1024*1024,...opts}).toString().trim();
const json=p=>{const st=lstatSync(p);if(!st.isFile()||st.size>4_000_000)fail('Invalid report file');return JSON.parse(readFileSync(p,'utf8'));};
// Same deterministic commit object reconstructed by every job; no changes to any app branch.
export function controlledCommit(repo,source,path='docs/pw-heavy-cross-commit-control.txt'){
 if(!SHA.test(source)||!['docs/pw-heavy-cross-commit-control.txt','scripts/pw-heavy-cross-commit-control.txt'].includes(path))fail('Invalid controlled commit input');
 const dir=mkdtempSync(join(tmpdir(),'pw-heavy-index-'));
 try{
  const env={...process.env,GIT_INDEX_FILE:join(dir,'index'),GIT_AUTHOR_NAME:'Pocket Works QA',GIT_AUTHOR_EMAIL:'qa@example.invalid',GIT_COMMITTER_NAME:'Pocket Works QA',GIT_COMMITTER_EMAIL:'qa@example.invalid',GIT_AUTHOR_DATE:'2000-01-01T00:00:00Z',GIT_COMMITTER_DATE:'2000-01-01T00:00:00Z'};
  const opt={env};
  git(repo,['read-tree',source],opt);
  const oid=git(repo,['hash-object','-w','--stdin'],{...opt,input:'Controlled unrelated input change\n'});
  git(repo,['update-index','--add','--cacheinfo','100644,'+oid+','+path],opt);
  const tree=git(repo,['write-tree'],opt);
  return git(repo,['-c','commit.gpgsign=false','commit-tree',tree,'-p',source,'-m','Controlled cross-commit qualification'],opt);
 }finally{rmSync(dir,{recursive:true,force:true});}
}
export function evaluate(kind,scope,prior,current,projection){
 const c=CASES[kind];if(!c||scope.app!==c.app||scope.distinctTrees!==true||scope.distinctCommits!==true||scope.scopeMatch!==true)fail('No controlled cross-commit equivalence');
 const runtimeDrift=[...new Set([...Object.keys(prior.runtime),...Object.keys(current.runtime)])].filter(k=>!Object.hasOwn(prior.runtime,k)||!Object.hasOwn(current.runtime,k)||!eq(prior.runtime[k],current.runtime[k])).sort();
 const mountMatch=eq(prior.mount,current.mount);
 const counts=projection.freshMeasurements.map(x=>x.length);
 const scenarios=kind==='crown'?Object.values(projection.coverage).reduce((a,b)=>a+b,0):projection.coverage.cases;
 if(scenarios!==c.count||counts.some(n=>n!==c.measurements)||!eq(projection.task,c.task))fail('Original simulation coverage changed');
 const controlled=runtimeDrift.every(k=>['kernel','cpu'].includes(k));
 const finding=!mountMatch||!controlled?'inconclusive-input-or-runtime':!projection.semanticMatch?'semantic-mismatch':runtimeDrift.length?'observed-directed-runtime-match':'observed-exact-runtime-match';
 return {schema:1,kind,scope,mountMatch,runtimeDrift,controlled,semanticMatch:projection.semanticMatch,scenarios,measurementCounts:counts,semanticDigests:projection.semanticDigests,rawDigests:projection.rawDigests,durationMs:projection.durationMs,finding,productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
}
function reconstruct(repo,commit,app){
 const dir=mkdtempSync(join(tmpdir(),'pw-heavy-proof-'));
 try{const bytes=execFileSync('git',['archive',commit,...scopeRoots(app)],{cwd:repo,maxBuffer:70*1024*1024});execFileSync('tar',['-xf','-','-C',dir],{input:bytes});return normalizeSnapshot(repo,commit,app,dir);}finally{rmSync(dir,{recursive:true,force:true});}
}
export function costObservation(prior,current,durations,gateMs){
 const fields=['preparationMs','executionWallMs','postVerificationMs'];
 for(const t of [prior,current])if(!t||!fields.every(k=>Number.isSafeInteger(t[k])&&t[k]>=0)||t.executionWallMs<=0)fail('Invalid observed timing');
 if(!Array.isArray(durations)||durations.length!==2||durations.some((x,i)=>!Number.isSafeInteger(x)||x<0||x>[prior,current][i].executionWallMs)||!Number.isSafeInteger(gateMs)||gateMs<0)fail('Invalid execution or audit duration');
 return {freshExecutionMs:durations,preparationMs:[prior.preparationMs,current.preparationMs],postVerificationMs:[prior.postVerificationMs,current.postVerificationMs],independentReconstructionMs:gateMs,observations:2,admission:economicDecision(null),note:'No measured signed reuse path or three comparable samples; no net savings claim'};
}
export function auditHeavyPair(repo,kind,root,ctx){
 const started=Date.now();
 const c=CASES[kind],target=controlledCommit(repo,c.source),scope=compareScope(repo,c.source,target,c.app);
 const negative=compareScope(repo,c.source,controlledCommit(repo,c.source,'scripts/pw-heavy-cross-commit-control.txt'),c.app);
 if(negative.scopeMatch!==false)fail('Scoped mutation not detected');
 const sides={};
 for(const side of ['prior','current']){
  const d=join(root,'heavy-'+ctx.attempt+'-'+kind+'-'+side),sha=side==='prior'?c.source:target;
  const meta=json(join(d,'identity.json'));
  if(!eq(meta,{...ctx,kind,side,sha,task:c.task}))fail('Wrong execution identity');
  const mount=reconstruct(repo,sha,c.app);
  for(const stage of ['before','inside','after'])if(!eq(mount,json(join(d,stage+'.json'))))fail('Independent mount proof differs');
  sides[side]={runtime:validateRuntime(json(join(d,'runtime.json'))),mount,dir:join(d,'output',c.task.key),timing:json(join(d,'timing.json'))};
 }
 let expected=null;
 if(kind==='banners'){
  // Both measured runners must agree with the historical source coverage.
  // This is a qualification check, not the production split-plan validator.
  expected=json(join(root,'heavy-'+ctx.attempt+'-'+kind+'-prior','expected.json'));
  if(!eq(expected,json(join(root,'heavy-'+ctx.attempt+'-'+kind+'-current','expected.json')))||expected.length!==c.count)fail('Banners case sequence differs');
  const expectedGroups={original:126,independent:11,historical:37,antiquity:17,'final-integration':24,'numerical-superiority':19,performance:1};
  if(!eq(Object.fromEntries(Object.keys(expectedGroups).map(k=>[k,expected.filter(x=>x===k).length])),expectedGroups))fail('Banners plan coverage differs');
 }
 const projection=compareFull(kind,sides.prior.dir,sides.current.dir,expected);
 const result=evaluate(kind,scope,sides.prior,sides.current,projection);
 return {...result,negativeControl:true,economics:costObservation(sides.prior.timing,sides.current.timing,projection.durationMs,Date.now()-started)};
}
const context=()=>({run:Number(process.env.GITHUB_RUN_ID),attempt:Number(process.env.GITHUB_RUN_ATTEMPT),controller:process.env.GITHUB_SHA});
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,kind,side,root]=process.argv.slice(2),repo=process.cwd(),ctx=context(),c=CASES[kind];
  if(!Number.isSafeInteger(ctx.run)||ctx.run<1||!Number.isSafeInteger(ctx.attempt)||ctx.attempt<1||!SHA.test(ctx.controller)||git(repo,['rev-parse','HEAD'])!==ctx.controller)fail('Wrong controller');
  if(mode==='identity'){
   if(!c||!['prior','current'].includes(side))fail('Invalid task');
   console.log(JSON.stringify({...ctx,kind,side,sha:side==='prior'?c.source:controlledCommit(repo,c.source),task:c.task}));
  }else if(mode==='gate'){
   const names=Object.keys(CASES).flatMap(k=>['prior','current'].map(s=>'heavy-'+ctx.attempt+'-'+k+'-'+s)).sort();
   if(!eq(readdirSync(root).sort(),names))fail('Incomplete or stale heavy matrix');
   const results=Object.keys(CASES).map(k=>auditHeavyPair(repo,k,root,ctx));
   const report={schema:1,...ctx,results,expected:4,passed:4,success:results.every(r=>r.semanticMatch&&r.mountMatch&&r.controlled),...flags};
   console.log(JSON.stringify(report,null,2));if(!report.success)process.exitCode=1;
  }else fail('Unknown operation');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
