// Renewable Banners evidence. No production authorization or inherited portability.
import {readFileSync,writeFileSync,lstatSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual as eq} from 'node:util';
import {validateManifest,validatePlan,validatePhase,normalizeScope,SOURCE,SOURCE_TREE,PLAN,WORKFLOW} from './verified-gameplay-receipt.mjs';
import {mountedFingerprint} from './verified-mounted-inputs.mjs';
import {digest} from './verified-results.mjs';
export const REPO='JustSadSock/pocket-works',RENEWAL_WORKFLOW='.github/workflows/gameplay-receipt-renewal.yml',APP_PR=1355,APP_BRANCH='app/banners-of-war';
const SHA=/^[a-f0-9]{40}$/,HEX=/^[a-f0-9]{64}$/,MAX_AGE=7*86400000,flags={productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
const fail=s=>{throw Error(s);},positive=n=>Number.isSafeInteger(n)&&n>0;
const gameplayRuntimeKeys=['contract','image','config','node','arch','toolchain','uid','gid'];
export function compatibleGameplayRuntime(a,b){
 return !!a&&!!b&&gameplayRuntimeKeys.every(k=>a[k]===b[k])&&
  Number.isSafeInteger(a.uid)&&Number.isSafeInteger(a.gid)&&Number.isSafeInteger(b.uid)&&Number.isSafeInteger(b.gid)&&
  HEX.test(a.kernel??'')&&HEX.test(a.cpu??'')&&HEX.test(b.kernel??'')&&HEX.test(b.cpu??'');
}
const read=(p,max=128*1024*1024)=>{const st=lstatSync(p);if(!st.isFile()||st.size>max)fail('Unsafe evidence file');return readFileSync(p);};
const json=p=>JSON.parse(read(p,4_000_000));
const git=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
export function resolveCandidate(pr,controller,mainSource){
 if(!SHA.test(controller)||pr?.number!==APP_PR||pr.head?.repo?.full_name!==REPO||pr.head?.ref!==APP_BRANCH||pr.base?.repo?.full_name!==REPO||pr.base?.ref!=='main')fail('Unapproved app branch');
 if(pr.state==='open'&&pr.merged===false&&pr.mergeable===true&&SHA.test(pr.head.sha)&&SHA.test(pr.base?.sha)&&SHA.test(pr.merge_commit_sha))return {source:pr.merge_commit_sha,sourceRef:'refs/pull/'+APP_PR+'/merge',sourcePR:APP_PR};
 if(pr.state==='closed'&&pr.merged===true&&SHA.test(mainSource)&&SHA.test(pr.merge_commit_sha))return {source:mainSource,sourceRef:'main',sourcePR:APP_PR};
 fail('No approved app candidate');
}
export function validateRenewalManifest(m,expected,mainOnly=true){
 if(!m||m.workflow!==RENEWAL_WORKFLOW||!SHA.test(m.source)||!SHA.test(m.sourceTree)||m.sourcePR!==APP_PR||!['main',APP_BRANCH,'refs/pull/'+APP_PR+'/merge'].includes(m.sourceRef))fail('Invalid renewal identity');
 validateManifest({...m,source:SOURCE,sourceTree:SOURCE_TREE,workflow:WORKFLOW},'source',false);
 if(mainOnly&&(m.ref!=='refs/heads/main'||!['push','schedule','workflow_dispatch'].includes(m.event)))fail('Not a main renewal');
 // Legacy validation only knows push/dispatch; schedule is normalized below by caller.
 for(const k of ['source','sourceTree','sourceRef','sourcePR','auditCommit','auditTree','run','attempt','ref','event','shard'])if(expected&&m[k]!==expected[k])fail('Renewal identity differs: '+k);
 return m;
}
function validateManifestForRenewal(m,expected,mainOnly=true){
 // Validate the same strict environment and mounts; schedule is an explicit main-only event.
 const legacyEvent=m?.event==='schedule'?'push':m?.event;
 const normalized={...m,event:legacyEvent},e=expected?{...expected,event:expected.event==='schedule'?'push':expected.event}:null;
 validateRenewalManifest(normalized,e,mainOnly);
 if(m.event==='schedule'&&m.ref!=='refs/heads/main')fail('Invalid schedule provenance');
 return m;
}
export function issueRenewal(root,expected,now=Date.now(),mainOnly=true){
 const m=validateManifestForRenewal(json(join(root,'manifest.json')),expected,mainOnly);
 if(!positive(now)||!eq(readdirSync(root).sort(),['gameplay','manifest.json','performance','plan.json']))fail('Incomplete renewal bundle');
 const p=validatePlan(json(join(root,'plan.json')),m),phases={};
 for(const name of ['gameplay','performance']){
  const dir=join(root,name);if(!eq(readdirSync(dir).sort(),['phase.json','records.jsonl']))fail('Invalid renewal phase');
  const rb=read(join(dir,'records.jsonl')),pb=read(join(dir,'phase.json'),2_000_000),raw=rb.toString('utf8').trim();
  const v=validatePhase(p,name,JSON.parse(pb),raw?raw.split('\n').map(JSON.parse):[],m);
  phases[name]={...v,recordsDigest:digest(rb),phaseDigest:digest(pb)};
 }
 const g=phases.gameplay,f=phases.performance;
 return {schema:1,kind:'renewable-banners-gameplay-v1',manifest:m,planDigest:PLAN,gameplayCases:g.cases,gameplaySemanticDigest:g.semanticDigest,gameplayRecordsDigest:g.recordsDigest,gameplayPhaseDigest:g.phaseDigest,sourceMeasurements:g.measurements,freshPerformanceCases:f.cases,freshPerformanceMeasurements:f.measurements,performanceRecordsDigest:f.recordsDigest,performancePhaseDigest:f.phaseDigest,issuedAt:now,...flags};
}
export function buildCatalog(receipts,expected,now=Date.now(),mainOnly=true){
 if(!Array.isArray(receipts)||receipts.length!==8||!positive(now))fail('Incomplete renewal matrix');
 const rows=[...receipts].sort((a,b)=>a.manifest.shard-b.manifest.shard);
 let cases=0,measurements=0,perf=0,perfMeasurements=0;
 for(const [shard,r] of rows.entries()){
  const m=validateManifestForRenewal(r.manifest,{...expected,shard},mainOnly);
  const n=shard<4?234:233,k=[4,5].includes(shard)?428:430,f=[0,4,5,6,7].includes(shard)?1:0;
  if(r.schema!==1||r.kind!=='renewable-banners-gameplay-v1'||r.planDigest!==PLAN||Object.keys(flags).some(x=>r[x]!==false)||r.gameplayCases!==n||r.sourceMeasurements!==k||r.freshPerformanceCases!==f||r.freshPerformanceMeasurements!==f*2||![r.gameplaySemanticDigest,r.gameplayRecordsDigest,r.gameplayPhaseDigest,r.performanceRecordsDigest,r.performancePhaseDigest].every(x=>HEX.test(x))||!positive(r.issuedAt)||r.issuedAt>now||now-r.issuedAt>MAX_AGE)fail('Invalid or expired shard '+shard);
  cases+=n;measurements+=k;perf+=f;perfMeasurements+=f*2;
 }
 if(cases!==1868||measurements!==3436||perf!==5||perfMeasurements!==10)fail('Incomplete coverage');
 if(rows.some(r=>!eq(r.manifest.sourceMount,rows[0].manifest.sourceMount)||!eq(r.manifest.auditMount,rows[0].manifest.auditMount)))fail('Mounted inputs differ across matrix');
 if(rows.some(r=>!compatibleGameplayRuntime(r.manifest.environment,rows[0].manifest.environment)))fail('Pinned gameplay runtime differs across matrix');
 return {schema:1,kind:'renewable-banners-catalog-v1',...expected,planDigest:PLAN,issuedAt:now,expiresAt:Math.min(...rows.map(r=>r.issuedAt))+MAX_AGE,gameplayCases:cases,sourceMeasurements:measurements,freshPerformanceCases:perf,freshPerformanceMeasurements:perfMeasurements,shards:rows.map(r=>({shard:r.manifest.shard,receiptDigest:digest(JSON.stringify(r)),gameplaySemanticDigest:r.gameplaySemanticDigest,environment:r.manifest.environment,sourceMount:r.manifest.sourceMount,auditMount:r.manifest.auditMount})),compatibility:'pinned-runtime-gameplay-v1',...flags};
}
export function catalogCandidate(catalog,target,now=Date.now()){
 try{
  if(catalog?.schema!==1||catalog.kind!=='renewable-banners-catalog-v1'||catalog.planDigest!==PLAN||!['exact-environment-only','pinned-runtime-gameplay-v1'].includes(catalog.compatibility)||Object.keys(flags).some(k=>catalog[k]!==false)||!positive(now)||!positive(catalog.issuedAt)||!positive(catalog.expiresAt)||now<catalog.issuedAt||now>catalog.expiresAt||catalog.expiresAt-catalog.issuedAt>MAX_AGE||catalog.gameplayCases!==1868||catalog.sourceMeasurements!==3436||catalog.freshPerformanceCases!==5||catalog.freshPerformanceMeasurements!==10||catalog.shards?.length!==8||catalog.shards.some((x,i)=>x.shard!==i||!HEX.test(x.receiptDigest)||!HEX.test(x.gameplaySemanticDigest)))fail('Invalid catalog');
  for(const k of ['source','sourceTree','auditCommit','auditTree','planDigest'])if(catalog[k]!==target[k])fail('Catalog identity differs: '+k);
  const r=catalog.shards[target.shard];
  if(!r||!(catalog.compatibility==='exact-environment-only'?eq(r.environment,target.environment):compatibleGameplayRuntime(r.environment,target.environment))||!eq(r.sourceMount,target.sourceMount)||!eq(r.auditMount,target.auditMount))fail('Unapproved target runtime or mount');
  return {decision:'candidate-only',receiptDigest:r.receiptDigest,...flags};
 }catch(e){return {decision:'execute',reason:e.message,...flags};}
}
function runtime(){return {auditCommit:process.env.GITHUB_SHA,auditTree:git(process.cwd(),['rev-parse','HEAD^{tree}']),run:Number(process.env.GITHUB_RUN_ID),attempt:Number(process.env.GITHUB_RUN_ATTEMPT),ref:process.env.GITHUB_REF,event:process.env.GITHUB_EVENT_NAME};}
function expected(source,shard){return {...source,...runtime(),shard};}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,...a]=process.argv.slice(2);
  if(mode==='normalize'){console.log(JSON.stringify(normalizeScope(...a)));}
  else if(mode==='measure'){console.log(JSON.stringify(mountedFingerprint(a[0])));}
  else{
   if(process.env.GITHUB_REPOSITORY!==REPO||!SHA.test(process.env.GITHUB_SHA)||git(process.cwd(),['rev-parse','HEAD'])!==process.env.GITHUB_SHA)fail('Wrong controller');
   if(mode==='select'){
    const [prPath,out]=a,pr=json(prPath),mainSource=process.env.RENEWAL_MAIN_SHA;
    writeFileSync(out,JSON.stringify(resolveCandidate(pr,process.env.GITHUB_SHA,mainSource),null,2)+'\n',{flag:'wx'});
   }else if(mode==='issue'){
    const [sourcePath,root,out]=a,source=json(sourcePath),m=expected(source,Number(process.env.SHARD));
    const r=issueRenewal(root,m,Date.now(),process.env.GITHUB_EVENT_NAME!=='pull_request');
    writeFileSync(out,JSON.stringify(r,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(r));
   }else if(mode==='catalog'){
    const [sourcePath,root,out]=a,source=json(sourcePath),ctx={...source,...runtime()},names=Array.from({length:8},(_,i)=>String(i));
    if(!eq(readdirSync(root).sort(),names))fail('Missing catalog shards');
    const rows=names.map(n=>{const d=join(root,n),r=json(join(d,'receipt.json'));if(!eq(r,issueRenewal(join(d,'bundle'),{...ctx,shard:Number(n)},r.issuedAt,process.env.GITHUB_EVENT_NAME!=='pull_request')))fail('Receipt differs from actual bundle');return r;});
    const catalog=buildCatalog(rows,ctx,Date.now(),process.env.GITHUB_EVENT_NAME!=='pull_request');
    writeFileSync(out,JSON.stringify(catalog,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(catalog,null,2));
   }else fail('Unknown renewal command');
  }
 }catch(e){console.error(e.message);process.exitCode=1;}
}
