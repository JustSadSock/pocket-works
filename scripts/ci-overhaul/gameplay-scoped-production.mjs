// Scope-bound production admission. Never broadens the signed catalog's inputs.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,lstatSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {isDeepStrictEqual as eq} from 'node:util';
import {canonical,digest} from './verified-results.mjs';
import {REPO,RENEWAL_WORKFLOW,issueRenewal,buildCatalog} from './gameplay-renewal.mjs';
import {PLAN,validatePlan,validatePhase} from './verified-gameplay-receipt.mjs';
import {qualifyCosts} from './banners-cross-commit-economic-qualification.mjs';
import {POLICY} from './universal-reuse-economics.mjs';
const ECON='.github/workflows/banners-cross-commit-economic-qualification.yml',SOURCE_SCOPE_VERSION='banners-runtime-v2',ECONOMIC_SOURCE='8c70528d57134a01558a3b9d5bef8d1e34d429a3',ECONOMIC_TARGET='ce4bc09ba2a105f6e8db0a8a0153da079f4e2c5f',ECONOMIC_ISSUER='3b4294292ba7aed4034231c8bc5ec277073bdfae',ECONOMIC_RUN=46050831661,ECONOMIC_ATTEMPT=1,SHA=/^[a-f0-9]{40}$/,HEX=/^[a-f0-9]{64}$/,AGE=7*86400000;
const flags={productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
const fail=s=>{throw Error(s);},pos=n=>Number.isSafeInteger(n)&&n>0;
const gh=a=>execFileSync('gh',a,{encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
const api=p=>JSON.parse(gh(['api','repos/'+REPO+'/'+p]));
const read=(p,max=128*1024*1024)=>{const s=lstatSync(p);if(!s.isFile()||s.size>max)fail('Unsafe scoped evidence');return readFileSync(p);};
const json=p=>JSON.parse(read(p,4_000_000));
const put=(p,x)=>writeFileSync(p,JSON.stringify(x,null,2)+'\n',{flag:'wx'});
export function scopedEnabled(e){
 return e.PW_QA_SCOPED_CROSS_COMMIT==='1'&&e.PW_QA_PRODUCTION_VERIFIED==='1'&&e.GITHUB_REPOSITORY===REPO&&e.GITHUB_EVENT_NAME==='pull_request'&&e.GITHUB_REF==='refs/pull/1355/merge'&&e.QA_PR_NUMBER==='1355'&&e.QA_HEAD_REPO===REPO&&e.QA_HEAD_REF==='app/banners-of-war';
}
function treeEntries(id,getTree){
 if(!SHA.test(id))fail('Invalid Git tree');
 const r=getTree(id);
 if(r?.sha!==id||r.truncated!==false||!Array.isArray(r.tree)||new Set(r.tree.map(x=>x.path)).size!==r.tree.length||r.tree.some(x=>typeof x.path!=='string'||!x.path||x.path.includes('/')||!SHA.test(x.sha)))fail('Incomplete Git tree');
 if(r.tree.some(x=>x.path==='.gitattributes'))fail('Archive attributes need review');
 return new Map(r.tree.map(x=>[x.path,x]));
}
function scopedRoots(id,getTree){
 const root=treeEntries(id,getTree),a=root.get('apps');
 if(a?.mode!=='040000'||a.type!=='tree')fail('Missing apps tree');
 const apps=treeEntries(a.sha,getTree);
 const selected=[['apps/banners-of-war',apps.get('banners-of-war'),'040000','tree'],['shared',root.get('shared'),'040000','tree'],['package.json',root.get('package.json'),'100644','blob'],['package-lock.json',root.get('package-lock.json'),'100644','blob']];
 return selected.map(([path,x,mode,type])=>{if(x?.mode!==mode||x.type!==type)fail('Missing scoped root: '+path);return {path,mode,type,sha:x.sha};});
}
export function proveScope(catalog,target,pr,commit,getTree){
 if(!catalog||catalog.sourceScopeVersion!==SOURCE_SCOPE_VERSION||catalog.sourcePR!==1355||!['app/banners-of-war','refs/pull/1355/merge'].includes(catalog.sourceRef)||!SHA.test(catalog.source)||!SHA.test(catalog.sourceTree)||!SHA.test(target?.source)||!SHA.test(target?.sourceTree)||catalog.source===target.source||catalog.sourceTree===target.sourceTree||
 pr?.number!==1355||pr.state!=='open'||pr.mergeable!==true||pr.head?.repo?.full_name!==REPO||pr.head?.ref!=='app/banners-of-war'||pr.base?.repo?.full_name!==REPO||pr.base?.ref!=='main'||!SHA.test(pr.base.sha)||!SHA.test(pr.head.sha)||pr.merge_commit_sha!==target.source||
 commit?.sha!==target.source||commit.tree?.sha!==target.sourceTree||!eq(commit.parents?.map(p=>p.sha),[pr.base.sha,pr.head.sha]))fail('Not an actual approved application merge');
 const a=scopedRoots(catalog.sourceTree,getTree),b=scopedRoots(target.sourceTree,getTree);
 if(!eq(a,b))fail('Tracked execution roots changed');
 // Full regular file and archive-attribute validation still takes place in
 // normalizeScope on the actual target; signed source mount remains unchanged.
 return {schema:1,kind:'scoped-cross-commit',scopeVersion:SOURCE_SCOPE_VERSION,source:catalog.source,sourceTree:catalog.sourceTree,checkout:target.source,tree:target.sourceTree,base:pr.base.sha,head:pr.head.sha,pr:1355,scopeDigest:digest(canonical(a)),...flags};
}
function mainEconomicRun(r,now){
 return r&&pos(r.id)&&pos(r.run_attempt)&&r.repository?.full_name===REPO&&r.head_repository?.full_name===REPO&&r.path===ECON&&r.head_branch==='main'&&r.event==='push'&&r.status==='completed'&&r.conclusion==='success'&&SHA.test(r.head_sha)&&Number.isFinite(Date.parse(r.created_at))&&Date.parse(r.created_at)<=now&&now-Date.parse(r.created_at)<AGE;
}
export function checkEconomicReport(report,catalog,now){
 if(catalog?.sourceScopeVersion!==SOURCE_SCOPE_VERSION||report?.schema!==1||report.source!==ECONOMIC_SOURCE||report.target!==ECONOMIC_TARGET||report.issuer!==ECONOMIC_ISSUER||report.run!==ECONOMIC_RUN||report.attempt!==ECONOMIC_ATTEMPT||report.negativeControls!==2||Object.keys(flags).some(k=>report[k]!==false)||!Array.isArray(report.fresh)||!Array.isArray(report.mixed)||report.fresh.some(x=>x.source!==ECONOMIC_SOURCE||x.issuer!==ECONOMIC_ISSUER)||report.mixed.some(x=>x.source!==ECONOMIC_SOURCE||x.issuer!==ECONOMIC_ISSUER))fail('Economics does not match the signed benchmark identity');
 const rebuilt=qualifyCosts(report.fresh,report.mixed,report.decision?.renewalMs,now);
 if(!eq(rebuilt,report.decision)||rebuilt.decision!=='cost-qualified-candidate')fail('No current economic qualification');
 return rebuilt;
}
function verifyEconomic(catalog,file,ref,now){
 const run=api('actions/runs/'+ref.run);
 if(!mainEconomicRun(run,now)||run.id!==ref.run||run.run_attempt!==ref.attempt||run.head_sha!==ref.issuer||digest(read(file))!==ref.digest)fail('Economic issuer or subject changed');
 gh(['attestation','verify',file,'--repo',REPO,'--cert-identity','https://github.com/'+REPO+'/'+ECON+'@refs/heads/main','--source-ref','refs/heads/main','--source-digest',run.head_sha,'--deny-self-hosted-runners']);
 const report=json(file);checkEconomicReport(report,catalog,now);
 const sourceCommit=api('git/commits/'+report.source),economicRoots=scopedRoots(sourceCommit.tree?.sha,id=>api('git/trees/'+id)),catalogRoots=scopedRoots(catalog.sourceTree,id=>api('git/trees/'+id));
 if(!eq(economicRoots,catalogRoots))fail('Signed economic benchmark source scope differs from the current catalog');
 return ref;
}
function proof(catalog,target){
 return proveScope(catalog,target,api('pulls/1355'),api('git/commits/'+target.source),id=>api('git/trees/'+id));
}
export function prepareScopedEvidence(catalog,target,dir,now=Date.now()){
 if(!scopedEnabled(process.env))fail('Scoped production route disabled');
 const started=Date.now(),scopeStarted=Date.now(),scope=proof(catalog,target),scopeProofMs=Date.now()-scopeStarted;
 const listStarted=Date.now(),list=api('actions/workflows/banners-cross-commit-economic-qualification.yml/runs?branch=main&status=success&per_page=10').workflow_runs,runListMs=Date.now()-listStarted;
 for(const run of list.filter(r=>mainEconomicRun(r,now)).slice(0,5)){
  const tmp=mkdtempSync(join(tmpdir(),'pw-scope-economics-'));
  try{
   const downloadStarted=Date.now();
   gh(['run','download',String(run.id),'--repo',REPO,'--name','recovered-economic-qualification-'+run.run_attempt,'--dir',tmp]);
   const economicDownloadMs=Date.now()-downloadStarted,file=join(tmp,'economics.json'),ref={run:run.id,attempt:run.run_attempt,issuer:run.head_sha,digest:digest(read(file))};
   const verifyStarted=Date.now();verifyEconomic(catalog,file,ref,now);const economicVerificationMs=Date.now()-verifyStarted;
   const admission={...scope,economic:ref},timingsMs={scopeProofMs,runListMs,economicDownloadMs,economicVerificationMs,totalMs:Date.now()-started};
   writeFileSync(join(dir,'scoped-economics.json'),read(file),{flag:'wx'});
   put(join(dir,'scoped-admission.json'),admission);put(join(dir,'scoped-timing.json'),timingsMs);
   return {...admission,timingsMs};
  }catch(e){console.log('Economic candidate '+run.id+' declined: '+String(e.message).slice(0,240));}finally{rmSync(tmp,{recursive:true,force:true});}
 }
 fail('No signed scope-bound economic evidence');
}
export function reconstructScopedEvidence(catalog,target,dir,now=Date.now()){
 if(!scopedEnabled(process.env))fail('Scoped production route disabled');
 const stored=json(join(dir,'scoped-admission.json')),scope=proof(catalog,target);
 const ref=verifyEconomic(catalog,join(dir,'scoped-economics.json'),stored.economic,now),actual={...scope,economic:ref};
 if(!eq(actual,stored))fail('Scoped proof changed');
 return actual;
}
export function validScopedEquivalence(p,catalog,target){
 return p?.schema===1&&p.kind==='scoped-cross-commit'&&p.scopeVersion===SOURCE_SCOPE_VERSION&&catalog.sourceScopeVersion===SOURCE_SCOPE_VERSION&&p.source===catalog.source&&p.sourceTree===catalog.sourceTree&&p.checkout===target.source&&p.tree===target.sourceTree&&p.sourceTree!==p.tree&&p.pr===1355&&SHA.test(p.base)&&SHA.test(p.head)&&HEX.test(p.scopeDigest)&&pos(p.economic?.run)&&pos(p.economic?.attempt)&&SHA.test(p.economic?.issuer)&&HEX.test(p.economic?.digest)&&Object.keys(flags).every(k=>p[k]===false);
}
// Match the original stable finite-number projection used by validatePhase.
function stable(x){
 if(x===null||typeof x==='boolean'||typeof x==='string'||typeof x==='number'&&Number.isFinite(x))return x;
 if(Array.isArray(x))return x.map(stable);
 if(x&&Object.getPrototypeOf(x)===Object.prototype)return Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])]));
 fail('Invalid simulation value');
}
const hash=x=>digest(JSON.stringify(stable(x)));
export function compareFreshCanary(rows,contract,rawPlan,receipt){
 const m=receipt.manifest,shard=m.shard,plan=validatePlan(rawPlan,m),s=plan.shards[shard],expected=[...s.gameplay,...s.performance].sort((a,b)=>a.index-b.index);
 if(contract?.schema!==1||contract.mode!=='fresh-split-v1'||contract.planDigest!==PLAN||contract.shard!==shard||contract.reused!==false||contract.allowResultReuse!==false||contract.allowImpactSkipping!==false||contract.gameplayCases!==s.gameplay.length||contract.performanceCases!==s.performance.length||!eq(contract.performanceSizes,s.performance.map(x=>x.value))||!Array.isArray(rows)||rows.length!==expected.length)fail('Missing original fresh split canary');
 const records=rows.map((r,i)=>{
  const e=expected[i];if(!eq(Object.keys(r).sort(),['kind','result','version'])||r.kind!==e.kind||r.version!==rawPlan.version)fail('Fresh canary case sequence differs');
  return {index:e.index,id:e.id,...r};
 });
 const context={source:m.source,run:m.run,attempt:m.attempt,auditCommit:m.auditCommit};
 const results={};
 for(const phase of ['gameplay','performance']){
  const selected=records.filter(r=>(r.kind==='performance')===(phase==='performance'));
  const report={schema:1,...context,shard,phase,planDigest:PLAN,version:rawPlan.version,expected:selected.length,completed:selected.length,productionAuthorization:false,recordDigest:hash(selected)};
  results[phase]=validatePhase(plan,phase,report,selected,m);
 }
 if(results.gameplay.semanticDigest!==receipt.gameplaySemanticDigest||results.gameplay.measurements!==receipt.sourceMeasurements||contract.freshMeasurements!==results.gameplay.measurements+results.performance.measurements)fail('Fresh canary semantics or measurements differ');
 return {gameplayCases:results.gameplay.cases,gameplaySemanticDigest:results.gameplay.semanticDigest,freshPerformanceCases:results.performance.cases,freshPerformanceMeasurements:results.performance.measurements};
}
export function auditScopedCanary(root,discovery,target,ctx){
 const started=Date.now(),discoveryReport=json(join(discovery,'discovery.json')),dir=join(discovery,'authenticated'),catalog=json(join(dir,'catalog.json')),timing=json(join(dir,'scoped-timing.json')),scope=reconstructScopedEvidence(catalog,target,dir);
 const discoveryMs=discoveryReport.lookupStats?.elapsedMs;
 if(discoveryReport.status!=='authenticated-candidate'||discoveryReport.scoped?.scopeDigest!==scope.scopeDigest||discoveryReport.scoped?.economic?.digest!==scope.economic.digest||!pos(discoveryMs)||!['scopeProofMs','runListMs','economicDownloadMs','economicVerificationMs','totalMs'].every(k=>Number.isSafeInteger(timing[k])&&timing[k]>=0))fail('Missing measured scoped discovery evidence');
 const run=api('actions/runs/'+catalog.run),shard=(ctx.run+ctx.attempt)%8,receipts=Array.from({length:8},(_,i)=>json(join(dir,'receipt-'+i+'.json')));
 if(run?.id!==catalog.run||run.run_attempt!==catalog.attempt||run.head_sha!==catalog.auditCommit||run.repository?.full_name!==REPO||run.head_repository?.full_name!==REPO||run.path!==RENEWAL_WORKFLOW||run.head_branch!=='main'||run.status!=='completed'||run.conclusion!=='success'||Date.now()>=catalog.expiresAt||!eq(catalog,buildCatalog(receipts,catalog,catalog.issuedAt,true)))fail('Canary source catalog identity differs');
 for(const name of ['catalog.json','receipt-'+shard+'.json'])gh(['attestation','verify',join(dir,name),'--repo',REPO,'--cert-identity','https://github.com/'+REPO+'/'+RENEWAL_WORKFLOW+'@refs/heads/main','--source-ref','refs/heads/main','--source-digest',catalog.auditCommit,'--deny-self-hosted-runners']);
 const receipt=receipts[shard],bundle=join(dir,'bundles','renewal-bundle-'+catalog.attempt+'-'+shard);
 if(!eq(receipt,issueRenewal(bundle,receipt.manifest,receipt.issuedAt,true)))fail('Canary signed receipt changed');
 const task='banners-of-war-completion-lab-'+shard,folder=join(root,'qa-'+task);
 const raw=read(join(folder,'completion-'+shard+'.jsonl')).toString('utf8').trim();
 const result=compareFreshCanary(raw?raw.split('\n').map(JSON.parse):[],json(join(folder,'split-contract.json')),json(join(bundle,'plan.json')),receipt);
 const canaryAuditMs=Date.now()-started,economic=json(join(dir,'scoped-economics.json')).decision,grossSavingsMs=economic.savingsMs,freshLowerMs=economic.freshLowerMs,overheadMs=discoveryMs+canaryAuditMs,netSavingsMs=grossSavingsMs-overheadMs,netSavingsBasisPoints=Math.floor(netSavingsMs/freshLowerMs*10000);
 if(!pos(grossSavingsMs)||!pos(freshLowerMs)||!Number.isSafeInteger(netSavingsMs)||netSavingsMs<POLICY.minSavingsMs||netSavingsBasisPoints<POLICY.minSavingsBasisPoints)fail('Measured scoped overhead erases the economic qualification');
 return {schema:1,task,shard,run:ctx.run,attempt:ctx.attempt,source:ctx.source,tree:ctx.tree,sourceRun:catalog.run,sourceAttempt:catalog.attempt,scopeVersion:SOURCE_SCOPE_VERSION,scopeDigest:scope.scopeDigest,economicDigest:scope.economic.digest,semanticMatch:true,...result,timingsMs:{discoveryMs,scopeProofMs:timing.scopeProofMs,runListMs:timing.runListMs,economicDownloadMs:timing.economicDownloadMs,economicVerificationMs:timing.economicVerificationMs,canaryAuditMs},economics:{grossSavingsMs,freshLowerMs,overheadMs,netSavingsMs,netSavingsBasisPoints},...flags};
}
