// Read-only discovery. A discovered catalog is not a production admission.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,readdirSync,lstatSync,renameSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual as eq} from 'node:util';
import {buildCatalog,issueRenewal,REPO,RENEWAL_WORKFLOW,APP_PR,APP_BRANCH} from './gameplay-renewal.mjs';
import {PLAN,SOURCE_SCOPE_VERSION} from './verified-gameplay-receipt.mjs';
import {scopedEnabled,prepareScopedEvidence} from './gameplay-scoped-production.mjs';
const SHA=/^[a-f0-9]{40}$/,MAX_AGE=7*86400000,positive=n=>Number.isSafeInteger(n)&&n>0;
const flags={productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
const fail=s=>{throw Error(s);},events=['push','schedule','workflow_dispatch'];
const subjects=['catalog.json',...Array.from({length:8},(_,i)=>'receipt-'+i+'.json')];
export function eligibleRuns(runs,now=Date.now()){
 if(!Array.isArray(runs)||!positive(now))return [];
 return runs.filter(r=>r&&positive(r.id)&&positive(r.run_attempt)&&r.path===RENEWAL_WORKFLOW&&r.head_branch==='main'&&events.includes(r.event)&&r.repository?.full_name===REPO&&r.head_repository?.full_name===REPO&&r.status==='completed'&&r.conclusion==='success'&&SHA.test(r.head_sha)&&Number.isFinite(Date.parse(r.created_at))&&Date.parse(r.created_at)<=now&&now-Date.parse(r.created_at)<=MAX_AGE)
 .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id-a.id).slice(0,100);
}
export function verifyDiscoveredCatalog(c,receipts,run,source,sourceTree,auditTree,now=Date.now()){
 if(eligibleRuns([run],now).length!==1||!SHA.test(source)||!SHA.test(sourceTree)||!SHA.test(auditTree)||c?.source!==source||c.sourceTree!==sourceTree||c.sourceScopeVersion!==SOURCE_SCOPE_VERSION||c.sourcePR!==APP_PR||!['main',APP_BRANCH,'refs/pull/'+APP_PR+'/merge'].includes(c.sourceRef)||c.auditCommit!==run.head_sha||c.auditTree!==auditTree||c.run!==run.id||c.attempt!==run.run_attempt||c.ref!=='refs/heads/main'||c.event!==run.event||c.planDigest!==PLAN||!positive(c.issuedAt)||!positive(c.expiresAt)||now<c.issuedAt||now>=c.expiresAt)fail('Wrong, stale or untrusted catalog identity');
 const ctx=Object.fromEntries(['source','sourceTree','sourceRef','sourcePR','auditCommit','auditTree','run','attempt','ref','event'].map(k=>[k,c[k]]));
 const rebuilt=buildCatalog(receipts,ctx,c.issuedAt,true),legacy={...rebuilt,compatibility:'exact-environment-only'};
 if(!eq(c,rebuilt)&&!eq(c,legacy))fail('Catalog and eight receipts differ');
 return {schema:1,status:'authenticated-candidate',source,sourceTree,sourceScopeVersion:SOURCE_SCOPE_VERSION,issuer:run.head_sha,issuerTree:auditTree,sourceRun:run.id,sourceAttempt:run.run_attempt,expiresAt:c.expiresAt,planDigest:PLAN,authenticatedSubjects:9,shards:8,compatibility:c.compatibility,...flags};
}
const gh=(args,timeout=30000)=>execFileSync('gh',args,{encoding:'utf8',timeout,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
const api=path=>JSON.parse(gh(['api',path]));
// Successful scheduled no-op runs are not catalog candidates. Metadata is only a
// cheap prefilter; all signatures and original bundles are still verified below.
export function catalogArtifactPresent(run,artifacts){
 const name='renewal-signed-catalog-'+run.run_attempt;
 if(!Array.isArray(artifacts))return false;
 const matches=artifacts.filter(a=>a?.name===name);
 return matches.length===1&&matches[0].expired===false&&positive(matches[0].id)&&positive(matches[0].size_in_bytes);
}
const hasPublishedCatalog=run=>catalogArtifactPresent(run,api('repos/'+REPO+'/actions/runs/'+run.id+'/artifacts?name=renewal-signed-catalog-'+run.run_attempt+'&per_page=100').artifacts);
const json=p=>{const st=lstatSync(p);if(!st.isFile()||st.size>4_000_000)fail('Invalid catalog subject');return JSON.parse(readFileSync(p,'utf8'));};
const tree=sha=>{const c=api('repos/'+REPO+'/git/commits/'+sha);if(c.sha!==sha||!SHA.test(c.tree?.sha))fail('Commit/tree API mismatch');return c.tree.sha;};
export function verifyBundles(root,receipts,run){
 const names=Array.from({length:8},(_,i)=>'renewal-bundle-'+run.run_attempt+'-'+i);
 if(!eq(readdirSync(root).sort(),names))fail('Incomplete original bundle set');
 for(const [i,n] of names.entries()){
  const r=receipts[i];
  if(!eq(r,issueRenewal(join(root,n),r.manifest,r.issuedAt,true)))fail('Signed receipt differs from original records: '+i);
 }
}
export function discoveryTarget(env,checkout){
 if(!SHA.test(checkout)||env.GITHUB_REPOSITORY!==REPO)return null;
 let expected;try{expected=JSON.parse(env.QA_EXPECTED??'[]');}catch{return null;}
 if(!Array.isArray(expected)||!expected.some(x=>typeof x==='string'&&/^banners-of-war-completion-lab-[0-7]$/.test(x)))return null;
 if(env.GITHUB_EVENT_NAME==='pull_request'){
  if(env.GITHUB_REF!=='refs/pull/'+APP_PR+'/merge'||env.QA_PR_NUMBER!==String(APP_PR)||env.QA_HEAD_REPO!==REPO||env.QA_HEAD_REF!==APP_BRANCH||!SHA.test(env.QA_HEAD_SHA))return null;
  if(env.QA_SOURCE_SHA!==undefined){if(env.PW_QA_INTEGRATION_SOURCE!=='1'||!SHA.test(env.QA_SOURCE_SHA))return null;return env.QA_SOURCE_SHA;}
  // actions/checkout has resolved refs/pull/<n>/merge. Webhook merge_commit_sha
  // can lag behind that ref, so the checked-out commit is the only source identity.
  return checkout;
 }
 if(env.GITHUB_REF==='refs/heads/main'&&['workflow_dispatch','issues','push'].includes(env.GITHUB_EVENT_NAME))return checkout;
 return null;
}
export function discover(source,checkout,out,{now=Date.now(),clock=Date.now,list=()=>api('repos/'+REPO+'/actions/workflows/gameplay-receipt-renewal.yml/runs?branch=main&status=success&per_page=100').workflow_runs,hasCatalog=hasPublishedCatalog,requiredIssuer=null,scopedCandidate=null,getTree=tree,getRun=id=>api('repos/'+REPO+'/actions/runs/'+id),download=(r,dir)=>gh(['run','download',String(r.id),'--repo',REPO,'--name','renewal-signed-catalog-'+r.run_attempt,'--dir',dir]),authenticate=(r,path)=>gh(['attestation','verify',path,'--repo',REPO,'--cert-identity','https://github.com/'+REPO+'/'+RENEWAL_WORKFLOW+'@refs/heads/main','--source-ref','refs/heads/main','--source-digest',r.head_sha,'--deny-self-hosted-runners']),downloadBundles=(r,dir)=>gh(['run','download',String(r.id),'--repo',REPO,'--pattern','renewal-bundle-'+r.run_attempt+'-*','--dir',dir],60000),checkBundles=verifyBundles}={}){
 const stats={listed:0,issuerExcluded:0,metadataChecks:0,withoutCatalog:0,candidateDownloads:0};
 const started=Date.now();
 const miss=(reason,attempted=0)=>{stats.elapsedMs=Math.max(0,Date.now()-started);return {schema:1,status:'fresh-fallback',source:source??null,checkout,reason,attempted,lookupStats:{...stats},...flags};};
 if(!source)return miss('No eligible Banners task');
 if(!SHA.test(source)||!SHA.test(checkout))return miss('Invalid source identity');
 let checked=0;
 try{
  const sourceTree=getTree(source);
  const candidates=eligibleRuns(list(),now);stats.listed=candidates.length;
  for(const listing of candidates){
   if(checked>=8)break;
   if(requiredIssuer!==null&&listing.head_sha!==requiredIssuer){stats.issuerExcluded++;continue;}
   // Limit expensive downloads, not successful no-op schedules. Metadata API
   // failures remain fail-closed via the outer fallback.
   stats.metadataChecks++;
   if(!hasCatalog(listing)){stats.withoutCatalog++;continue;}
   checked++;
   const tmp=mkdtempSync(join(out,'candidate-'));
   try{
    const run=getRun(listing.id);
    if(eligibleRuns([run],now).length!==1||run.id!==listing.id||run.head_sha!==listing.head_sha||run.run_attempt!==listing.run_attempt)fail('Run changed during lookup');
    stats.candidateDownloads++;
    download(run,tmp);
    if(!eq(readdirSync(tmp).sort(),[...subjects].sort()))fail('Missing or extra signed subjects');
    const c=json(join(tmp,'catalog.json'));
    const exact=c.source===source&&c.sourceTree===sourceTree;
    if(!exact&&(!scopedCandidate||c.source===source||c.sourceTree===sourceTree||!SHA.test(c.source)||!SHA.test(c.sourceTree)))continue;
    // Check the catalog before trusting its receipt references; every subject
    // is verified independently against the exact main run's signer digest.
    for(const name of subjects){json(join(tmp,name));authenticate(run,join(tmp,name));}
    const receipts=subjects.slice(1).map(n=>json(join(tmp,n)));
    const r=verifyDiscoveredCatalog(c,receipts,run,exact?source:c.source,exact?sourceTree:getTree(c.source),getTree(run.head_sha),now);
    const bundleRoot=join(tmp,'bundles');mkdirSync(bundleRoot);
    downloadBundles(run,bundleRoot);checkBundles(bundleRoot,receipts,run);
    const scoped=exact?null:scopedCandidate(c,{source,sourceTree},tmp,clock());
    if(!exact&&scoped?.kind!=='scoped-cross-commit')fail('Scoped candidate declined');
    const finalRun=getRun(run.id);
    if(eligibleRuns([finalRun],clock()).length!==1||finalRun.run_attempt!==run.run_attempt||finalRun.head_sha!==run.head_sha||clock()>=r.expiresAt)fail('Run or freshness changed after authentication');
    renameSync(tmp,join(out,'authenticated'));
    stats.elapsedMs=Math.max(0,Date.now()-started);
    return {...r,verifiedBundles:8,checkout,checkoutMatchesSource:checkout===r.source,attempted:checked,lookupStats:{...stats},...(scoped?{requestedSource:source,requestedTree:sourceTree,scoped}: {})};
   }catch(e){console.log('Renewal candidate '+listing.id+' declined: '+String(e.message).slice(0,300));}
   finally{rmSync(tmp,{recursive:true,force:true});}
  }
  return miss('No authentic unexpired catalog for requested source',checked);
 }catch(e){return miss('Discovery unavailable: '+String(e.message).slice(0,200),checked);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const out=resolve(process.argv[2]),checkout=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  mkdirSync(out,{recursive:false});
  const source=discoveryTarget(process.env,checkout);
  const result=discover(source,checkout,out,{scopedCandidate:scopedEnabled(process.env)&&source===checkout?prepareScopedEvidence:null});
  writeFileSync(join(out,'discovery.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(result,null,2));
 }catch(e){console.error(e.message);process.exitCode=1;}
}
