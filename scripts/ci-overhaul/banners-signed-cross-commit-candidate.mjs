// Narrow bridge from a real signed Banners catalog to a different scoped commit.
// Qualification only. The existing production delivery authorization stays unchanged.
import {execFileSync} from 'node:child_process';
import {readFileSync,lstatSync,mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonical,digest} from './verified-results.mjs';
import {compareScope} from './universal-cross-commit.mjs';
import {controlledCommit} from './heavy-cross-commit.mjs';
import {normalizeScope,PLAN} from './verified-gameplay-receipt.mjs';
import {catalogCandidate,REPO} from './gameplay-renewal.mjs';
import {discover} from './gameplay-receipt-discovery.mjs';
import {validateRuntime} from './universal-signed-receipts.mjs';
import {economicDecision} from './universal-reuse-economics.mjs';
const SOURCE='8c70528d57134a01558a3b9d5bef8d1e34d429a3',ISSUER='3b4294292ba7aed4034231c8bc5ec277073bdfae',RUN=45996361840;
const flags={productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
const fail=s=>{throw Error(s);},eq=(a,b)=>canonical(a)===canonical(b);
const git=(repo,args)=>execFileSync('git',args,{cwd:repo,maxBuffer:70*1024*1024}).toString().trim();
const gh=args=>execFileSync('gh',args,{encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});
const json=p=>{const s=lstatSync(p);if(!s.isFile()||s.size>4_000_000)fail('Invalid proof file');return JSON.parse(readFileSync(p,'utf8'));};
const put=(p,x)=>writeFileSync(p,JSON.stringify(x,null,2)+'\n',{flag:'wx'});
function mount(repo,sha,kind){
 const dir=mkdtempSync(join(tmpdir(),'pw-signed-scope-'));
 try{
  const roots=kind==='audit'?['scripts/ci-overhaul']:['apps/banners-of-war','shared','scripts','package.json','package-lock.json'];
  const a=execFileSync('git',['archive',sha,...roots],{cwd:repo,maxBuffer:70*1024*1024});
  execFileSync('tar',['-xf','-','-C',dir],{input:a});
  return normalizeScope(repo,sha,dir,kind);
 }finally{rmSync(dir,{recursive:true,force:true});}
}
function runtime(r){
 validateRuntime(r);
 return {...r,contract:'banners-offline-phase-v1',image:r.image.split('@sha256:')[1],config:r.config.slice(7)};
}
// Must only be called after independent authentication of catalog and bundles.
export function assessScopedCandidate(catalog,scope,target,now){
 const fresh=reason=>({decision:'execute',reason,...flags});
 if(!catalog||!scope||!target||scope.app!=='banners-of-war'||scope.prior!==catalog.source||scope.current!==target.source||scope.priorTree!==catalog.sourceTree||scope.currentTree!==target.sourceTree||scope.distinctCommits!==true||scope.distinctTrees!==true||scope.scopeMatch!==true||scope.priorDigest!==scope.currentDigest||!Array.isArray(scope.changedScopedPaths)||scope.changedScopedPaths.length!==0)return fresh('Scoped Git inputs differ');
 if(target.auditCommit!==catalog.auditCommit||target.auditTree!==catalog.auditTree||target.planDigest!==catalog.planDigest)return fresh('Issuer or plan changed');
 // Only the source identity is substituted, after proving equality of all visible
 // source bytes. The original catalog still checks environment and both mounts.
 const rows=Array.from({length:8},(_,shard)=>({shard,...catalogCandidate(catalog,{...target,source:catalog.source,sourceTree:catalog.sourceTree,shard},now)}));
 if(rows.some(r=>r.decision!=='candidate-only'))return {...fresh('Catalog mount or environment declined'),rows};
 return {decision:'candidate-only',identity:'scoped-cross-commit',source:catalog.source,target:target.source,receiptDigests:rows.map(r=>r.receiptDigest),rows,...flags};
}
function actual(repo){
 const run=Number(process.env.GITHUB_RUN_ID),attempt=Number(process.env.GITHUB_RUN_ATTEMPT),controller=git(repo,['rev-parse','HEAD']);
 if(process.env.GITHUB_REPOSITORY!==REPO||controller!==process.env.GITHUB_SHA||!Number.isSafeInteger(run)||run<1||!Number.isSafeInteger(attempt)||attempt<1)fail('Invalid qualification context');
 const target=controlledCommit(repo,SOURCE);
 return {run,attempt,controller,source:SOURCE,target,issuer:ISSUER,sourceRun:RUN};
}
function audit(repo,dir,ctx){
 const started=Date.now(),auth=mkdtempSync(join(tmpdir(),'pw-candidate-auth-'));
 try{
  const run=JSON.parse(gh(['api','repos/'+REPO+'/actions/runs/'+RUN]));
  const found=discover(SOURCE,ctx.target,auth,{list:()=>[run],requiredIssuer:ISSUER});
  if(found.status!=='authenticated-candidate'||found.authenticatedSubjects!==9||found.verifiedBundles!==8||found.sourceRun!==RUN||found.issuer!==ISSUER)fail('Pinned signed catalog unavailable: '+found.reason);
  const authMs=Date.now()-started,catalog=json(join(auth,'authenticated','catalog.json'));
  const scope=compareScope(repo,SOURCE,ctx.target,'banners-of-war');
  const targetMount=mount(repo,ctx.target,'source'),sourceMount=mount(repo,SOURCE,'source'),auditMount=mount(repo,ISSUER,'audit');
  if(!eq(targetMount,sourceMount)||!eq(ctx,json(join(dir,'identity.json'))))fail('Independent target identity differs');
  for(const [kind,m] of [['source',targetMount],['audit',auditMount]])for(const stage of ['before','inside','after'])if(!eq(m,json(join(dir,kind+'-'+stage+'.json'))))fail('Independent measured mount differs: '+kind+'/'+stage);
  const target={source:ctx.target,sourceTree:scope.currentTree,auditCommit:ISSUER,auditTree:git(repo,['rev-parse',ISSUER+'^{tree}']),sourceMount:targetMount,auditMount,environment:runtime(json(join(dir,'runtime.json'))),planDigest:PLAN};
  const result=assessScopedCandidate(catalog,scope,target,Date.now());
  if(result.decision!=='candidate-only')fail('Actual candidate declined: '+result.reason);
  const negative=controlledCommit(repo,SOURCE,'scripts/pw-heavy-cross-commit-control.txt'),bad=compareScope(repo,SOURCE,negative,'banners-of-war');
  if(assessScopedCandidate(catalog,bad,{...target,source:negative,sourceTree:bad.currentTree},Date.now()).decision!=='execute')fail('Scoped mutation accepted');
  if(assessScopedCandidate(catalog,scope,{...target,sourceMount:{...targetMount,digest:'0'.repeat(64)}},Date.now()).decision!=='execute')fail('Mount mutation accepted');
  if(assessScopedCandidate(catalog,scope,{...target,environment:{...target.environment,toolchain:'0'.repeat(64)}},Date.now()).decision!=='execute')fail('Toolchain mutation accepted');
  if(assessScopedCandidate(catalog,scope,target,catalog.expiresAt+1).decision!=='execute')fail('Expired evidence accepted');
  const report={schema:1,context:ctx,scope,target,authenticatedSubjects:9,verifiedBundles:8,sourceCatalogDigest:digest(canonical(catalog)),candidate:result,negativeControls:4,gameplayCandidates:catalog.gameplayCases,alwaysFreshPerformanceCases:catalog.freshPerformanceCases,economics:economicDecision(null),...flags};
  return {report,timing:{authenticationMs:authMs,independentVerificationMs:Date.now()-started-authMs}};
 }finally{rmSync(auth,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,dir,out]=process.argv.slice(2),repo=process.cwd(),ctx=actual(repo);
  if(mode==='identity')console.log(JSON.stringify(ctx));
  else if(mode==='issue'){
   const {report,timing}=audit(repo,dir,ctx);put(join(dir,'candidate.json'),report);put(join(dir,'cost.json'),timing);console.log(JSON.stringify({report,timing},null,2));
  }else if(mode==='gate'){
   const {report,timing}=audit(repo,dir,ctx);
   if(!eq(report,json(join(dir,'candidate.json'))))fail('Independent candidate differs');
   const cost=json(join(dir,'cost.json'));
   if(!['authenticationMs','independentVerificationMs'].every(k=>Number.isSafeInteger(cost[k])&&cost[k]>=0))fail('Invalid observed costs');
   const verdict={...report,success:true,observedCandidateCost:cost,observedIndependentCost:timing,reusedTasks:0,...flags};
   put(out,verdict);console.log(JSON.stringify(verdict,null,2));
  }else fail('Unknown operation');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
