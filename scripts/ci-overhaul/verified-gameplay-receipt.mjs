// Main-only signed gameplay receipt pilot. Not a production QA result.
import {readFileSync,writeFileSync,lstatSync,readdirSync,chmodSync,utimesSync,realpathSync} from 'node:fs';
import {join,resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {canonical,digest} from './verified-results.mjs';
import {mountedFingerprint} from './verified-mounted-inputs.mjs';
export const SOURCE='45d6ce53df3cd5013a605bba972d94f1c0cd8dce';
export const SOURCE_TREE='9a9cc376c7ce39e9a7116cf7fd8f6ec3e720b80c';
export const PLAN='81f618b94fadc8e1bd96ff66a339528c55b768e72ac50767ada94de409e2ee25';
export const WORKFLOW='.github/workflows/verified-gameplay-receipt.yml';
export const REPLAY_WORKFLOW='.github/workflows/verified-gameplay-replay.yml';
const REPO='JustSadSock/pocket-works',HEX=/^[a-f0-9]{64}$/,SHA=/^[a-f0-9]{40}$/,EPOCH=946684800;
const IMAGE='be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb';
const LIMIT=128*1024*1024;
const scopes={source:['apps/banners-of-war','shared','scripts','package.json','package-lock.json'],audit:['scripts/ci-overhaul']};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
function stable(x){
 if(x===null||typeof x==='boolean'||typeof x==='string'||typeof x==='number'&&Number.isFinite(x))return x;
 if(Array.isArray(x))return x.map(stable);
 if(plain(x))return Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])]));
 throw Error('Invalid JSON value');
}
const hash=x=>digest(JSON.stringify(stable(x)));
const eq=(a,b)=>canonical(a)===canonical(b);
const int=n=>Number.isSafeInteger(n)&&n>0;
const validShard=n=>Number.isInteger(n)&&n>=0&&n<8;
const gameCount=n=>validShard(n)?(n<4?234:233):NaN;
const performanceSizes=n=>({0:[150],4:[26],5:[40],6:[60],7:[100]})[n]??[];
const expectedMeasurements=entries=>entries.reduce((n,e)=>n+(e.kind==='numerical-superiority'?0:2),0);
const validMeasurements=(n,c)=>Number.isInteger(n)&&n>=0&&n<=2*c&&n%2===0;
const read=(p,max=LIMIT)=>{const s=lstatSync(p);if(!s.isFile()||s.size>max)throw Error('Invalid evidence file');return readFileSync(p);};
const json=p=>JSON.parse(read(p,4_000_000).toString('utf8'));
const pathOK=p=>p&&p.length<=1024&&!/[\\\x00-\x1f\x7f\ufffd]/.test(p)&&p.split('/').every(s=>s&&s!=='.'&&s!=='..');
const git=(repo,args)=>execFileSync('git',args,{cwd:repo,maxBuffer:64*1024*1024});
// Match every mounted byte to an immutable Git blob, not just a tar digest.
export function normalizeScope(repo,commit,root,kind){
 const roots=scopes[kind];if(!roots||!SHA.test(commit)||git(repo,['rev-parse',commit+'^{commit}']).toString().trim()!==commit)throw Error('Invalid snapshot source');
 const a=realpathSync(repo),b=realpathSync(root),rel=relative(a,b);
 if(!rel||!(rel==='..'||rel.startsWith('../')))throw Error('Snapshot must be outside checkout');
 const raw=git(repo,['ls-tree','-r','-z','--full-tree',commit]),s=raw.toString('utf8');
 if(!Buffer.from(s).equals(raw))throw Error('Invalid path encoding');
 const all=s.split('\0').filter(Boolean).map(row=>{const q=/^([0-7]{6}) (blob|commit) ([a-f0-9]{40})\t(.+)$/.exec(row);if(!q||!pathOK(q[4]))throw Error('Invalid Git entry');return {mode:q[1],type:q[2],oid:q[3],path:q[4]};});
 if(all.some(r=>r.path==='.gitattributes'||r.path.endsWith('/.gitattributes')))throw Error('Archive attributes require review');
 const files=all.filter(r=>roots.some(p=>r.path===p||r.path.startsWith(p+'/')));
 if(roots.some(p=>!files.some(r=>r.path===p||r.path.startsWith(p+'/')))||files.some(r=>r.type!=='blob'||!['100644','100755'].includes(r.mode)))throw Error('Invalid tracked scope');
 const expected=new Map(files.map(r=>[r.path,r])),dirs=new Set(['']);
 for(const f of files){let p=dirname(f.path);while(p!=='.'){dirs.add(p);p=dirname(p);}}
 let bytes=0,seen=0;
 function visit(p,rel){
  const st=lstatSync(p);
  if(st.isDirectory()){
   if(!dirs.delete(rel))throw Error('Unexpected directory');
   for(const n of readdirSync(p))visit(join(p,n),rel?rel+'/'+n:n);
   chmodSync(p,0o755);utimesSync(p,EPOCH,EPOCH);return;
  }
  const e=expected.get(rel);
  if(!e||!st.isFile()||st.nlink!==1||(bytes+=st.size)>64*1024*1024)throw Error('Unsafe mounted file');
  const data=readFileSync(p),oid=createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex');
  if(oid!==e.oid||Boolean(st.mode&0o111)!==(e.mode==='100755'))throw Error('Mounted input differs: '+rel);
  expected.delete(rel);seen++;chmodSync(p,e.mode==='100755'?0o755:0o644);utimesSync(p,EPOCH,EPOCH);
 }
 visit(b,'');if(expected.size||dirs.size||seen!==files.length)throw Error('Incomplete snapshot');
 return mountedFingerprint(b);
}
function mountOK(m){return m?.schema===1&&HEX.test(m.digest)&&int(m.files)&&int(m.directories)&&int(m.bytes)&&m.bytes<=64*1024*1024&&m.productionAuthorization===false&&m.reuse===false;}
export function validateManifest(m,role,mainOnly=true){
 if(!plain(m)||m.schema!==1||!validShard(m.shard)||m.repository!==REPO||m.workflow!==WORKFLOW||m.role!==role||m.source!==SOURCE||m.sourceTree!==SOURCE_TREE||!SHA.test(m.auditCommit)||!SHA.test(m.auditTree)||!int(m.run)||!int(m.attempt)||m.productionAuthorization!==false||
 (mainOnly?(m.ref!=='refs/heads/main'||!['push','workflow_dispatch'].includes(m.event)):!(m.ref==='refs/heads/main'&&['push','workflow_dispatch'].includes(m.event)||/^refs\/pull\/\d+\/merge$/.test(m.ref)&&m.event==='pull_request')))throw Error('Invalid pilot provenance');
 if(!mountOK(m.sourceMount)||!mountOK(m.auditMount))throw Error('Incomplete mounted proof');
 const e=m.environment;
 if(!plain(e)||!eq(Object.keys(e).sort(),['arch','config','contract','cpu','gid','image','kernel','node','toolchain','uid'])||e.contract!=='banners-offline-phase-v1'||e.image!==IMAGE||e.arch!=='x64'||!/^v22\.\d+\.\d+$/.test(e.node)||!['config','cpu','kernel','toolchain'].every(k=>HEX.test(e[k]))||!int(e.uid)||!int(e.gid))throw Error('Incomplete execution environment');
 return m;
}
const context=m=>({source:m.source,run:m.run,attempt:m.attempt,auditCommit:m.auditCommit});
export function validatePlan(p,m){
 if(!p||!eq(p.context,context(m))||p.version!=='chronicles-completion-v1'||p.plan?.schema!==1||p.plan.count!==8||p.plan.total!==1873||p.plan.planDigest!==PLAN||hash(p.plan.shards)!==PLAN||p.plan.productionAuthorization!==false)throw Error('Unapproved original plan');
 return p.plan;
}
export function validatePhase(plan,phase,report,records,m){
 if(!validShard(m.shard)||!['gameplay','performance'].includes(phase))throw Error('Invalid shard or phase');
 const entries=plan.shards[m.shard][phase],n=phase==='gameplay'?gameCount(m.shard):performanceSizes(m.shard).length;
 if(entries.length!==n||phase==='performance'&&!eq(entries.map(e=>e.value),performanceSizes(m.shard))||!Array.isArray(records)||records.length!==n||
 report?.schema!==1||!eq(context(report),context(m))||report.shard!==m.shard||report.phase!==phase||report.planDigest!==PLAN||report.version!=='chronicles-completion-v1'||report.expected!==n||report.completed!==n||report.productionAuthorization!==false||report.recordDigest!==hash(records))throw Error('Incomplete fresh phase');
 let measurements=0;
 const semantic=records.map((r,i)=>{
  const e=entries[i];
  if(r.index!==e.index||r.id!==e.id||r.kind!==e.kind||r.version!==report.version||!plain(r.result)||((r.kind==='performance')!==(phase==='performance')))throw Error('Case identity/order mismatch');
  const result={...r.result},fields=r.kind==='numerical-superiority'?[]:['historical','performance'].includes(r.kind)?['plannerMs','physicsMs']:['planMs','physicsMs'];
  for(const field of fields){if(!Number.isFinite(result[field])||result[field]<0)throw Error('Missing fresh measurement');measurements++;delete result[field];}
  if(phase==='performance'&&(r.result.units!==e.value||!Number.isFinite(r.result.seconds)||r.result.seconds<=0||!int(r.result.snapshotChars)))throw Error('Wrong fresh performance scenario');
  return {...r,result};
 });
 if(measurements!==expectedMeasurements(entries))throw Error('Missing measurement coverage');
 return {cases:n,semanticDigest:hash(semantic),measurements,performance:phase==='performance'?records.map(r=>r.result):null};
}
function phaseBundle(root,name,plan,m){
 const dir=join(root,name);
 if(!eq(readdirSync(dir).sort(),['phase.json','records.jsonl']))throw Error('Unexpected phase files');
 const rb=read(join(dir,'records.jsonl')),pb=read(join(dir,'phase.json'),2_000_000);
 const raw=rb.toString('utf8').trim(),records=raw?raw.split('\n').map(JSON.parse):[],report=JSON.parse(pb);
 return {...validatePhase(plan,name,report,records,m),recordsDigest:digest(rb),phaseDigest:digest(pb)};
}
export function makeReceipt(root,now=Date.now(),mainOnly=true){
 const m=validateManifest(json(join(root,'manifest.json')),'source',mainOnly),p=validatePlan(json(join(root,'plan.json')),m),g=phaseBundle(root,'gameplay',p,m);
 if(!int(now))throw Error('Invalid issuance time');
 return {schema:2,kind:'banners-gameplay-shadow-v2',manifest:m,planDigest:PLAN,shard:m.shard,gameplayCases:g.cases,gameplaySemanticDigest:g.semanticDigest,gameplayRecordsDigest:g.recordsDigest,gameplayPhaseDigest:g.phaseDigest,sourceMeasurements:g.measurements,issuedAt:now,productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
}
// The upstream API result is independent of the downloaded receipt.
// Only the exact completed main run that triggered this read-only replay is eligible.
export function validateReplayTarget(m){
 if(m?.workflow!==REPLAY_WORKFLOW||m.role!=='replay'||m.event!=='workflow_run'||m.ref!=='refs/heads/main'||!int(m.upstreamRun)||!int(m.upstreamAttempt)||m.run===m.upstreamRun)throw Error('Invalid independent replay identity');
 validateManifest({...m,workflow:WORKFLOW,role:'trial',event:'push'},'trial');
 return m;
}
export function checkUpstream(u,s,t){
 if(!u||u.id!==s.run||u.run_attempt!==s.attempt||u.id!==t.upstreamRun||u.run_attempt!==t.upstreamAttempt||
 u.repository?.full_name!==REPO||u.head_repository?.full_name!==REPO||u.path!==WORKFLOW||
 u.head_branch!=='main'||u.head_sha!==s.auditCommit||u.head_sha!==t.auditCommit||u.event!==s.event||
 u.status!=='completed'||u.conclusion!=='success')throw Error('Upstream is not the exact completed trusted run');
}
export function decide(receipt,target,now=Date.now(),upstream=null){
 const fresh=reason=>({schema:1,decision:'execute',reason,productionAuthorization:false});
 try{
  const s=validateManifest(receipt.manifest,'source'),cross=target?.role==='replay',t=cross?validateReplayTarget(target):validateManifest(target,'trial');
  if(cross)checkUpstream(upstream,s,t);else if(upstream!==null)throw Error('Unexpected upstream');
  if(receipt.kind!=='banners-gameplay-shadow-v2'||receipt.schema!==2||receipt.planDigest!==PLAN||receipt.shard!==s.shard||receipt.gameplayCases!==gameCount(s.shard)||!validMeasurements(receipt.sourceMeasurements,receipt.gameplayCases)||receipt.productionAuthorization!==false||receipt.allowResultReuse!==false||receipt.allowImpactSkipping!==false||![receipt.gameplaySemanticDigest,receipt.gameplayRecordsDigest,receipt.gameplayPhaseDigest].every(x=>HEX.test(x))||!int(receipt.issuedAt)||!int(now)||now<receipt.issuedAt||now-receipt.issuedAt>7*86400000)throw Error('Invalid or expired receipt');
  for(const key of ['repository','ref','source','sourceTree','auditCommit','auditTree','shard',...(cross?[]:['workflow','event','run','attempt'])])if(s[key]!==t[key])throw Error('Different source identity: '+key);
  for(const key of ['sourceMount','auditMount'])if(!eq(s[key],t[key]))throw Error('Different mounted input: '+key);
  const changed=Object.keys(s.environment).filter(k=>s.environment[k]!==t.environment[k]).sort();
  if(changed.length)return {...fresh('Execution environment differs'),changedFields:changed};
  return {schema:1,decision:'reuse-shadow',gameplaySemanticDigest:receipt.gameplaySemanticDigest,gameplayRecordsDigest:receipt.gameplayRecordsDigest,productionAuthorization:false};
 }catch(e){return fresh(e.message);}
}
// Admission is evidence of identity, not an independently observed semantic match.
export function summarizeGameplayComparison(receipt,admission,fresh){
 if(!receipt||receipt.gameplayCases!==gameCount(receipt.shard)||!validMeasurements(receipt.sourceMeasurements,receipt.gameplayCases)||!HEX.test(receipt.gameplaySemanticDigest)||admission?.productionAuthorization!==false)throw Error('Invalid comparison evidence');
 const hit=admission.decision==='reuse-shadow';
 if(hit){
  if(fresh!==null||admission.gameplaySemanticDigest!==receipt.gameplaySemanticDigest||admission.gameplayRecordsDigest!==receipt.gameplayRecordsDigest)throw Error('Ambiguous reused gameplay evidence');
 }else if(admission.decision!=='execute'||fresh?.cases!==receipt.gameplayCases||fresh?.measurements!==receipt.sourceMeasurements||!HEX.test(fresh.semanticDigest))throw Error('Incomplete fresh gameplay comparison');
 const semanticMatch=hit?null:fresh.semanticDigest===receipt.gameplaySemanticDigest;
 return {gameplayCases:receipt.gameplayCases,gameplayExecuted:!hit,gameplayReused:hit,
  freshGameplayCases:hit?0:fresh.cases,reusedGameplayCases:hit?receipt.gameplayCases:0,
  historicalGameplayMeasurements:receipt.sourceMeasurements,freshGameplayMeasurements:hit?0:fresh.measurements,
  sourceGameplaySemanticDigest:receipt.gameplaySemanticDigest,freshGameplaySemanticDigest:hit?null:fresh.semanticDigest,
  semanticMatch,semanticComparison:hit?'not-executed':semanticMatch?'match':'mismatch'};
}
// Every shard report is produced by the independently authenticated runner.
export function aggregateReplay(rows,expected){
 if(!Array.isArray(rows)||rows.length!==8)throw Error('Missing replay shards');
 const ordered=[...rows].sort((a,b)=>a.shard-b.shard);
 const plans=[],perShard=[];let freshGameplayCases=0,reusedGameplayCases=0,freshGameplayMeasurements=0,historicalGameplayMeasurements=0,freshPerformanceCases=0,freshPerformanceMeasurements=0;
 for(const [shard,r] of ordered.entries()){
  if(r.schema!==3||r.shard!==shard||r.source!==SOURCE||r.auditCommit!==expected.auditCommit||r.auditTree!==expected.auditTree||r.planDigest!==PLAN||r.mode!==expected.mode||r.sourceRun!==expected.sourceRun||r.sourceAttempt!==expected.sourceAttempt||r.targetRun!==expected.targetRun||r.targetAttempt!==expected.targetAttempt||r.productionAuthorization!==false||r.allowResultReuse!==false||r.allowImpactSkipping!==false)throw Error('Wrong replay context: '+shard);
  const p=r.planShard,hit=r.admission?.decision==='reuse-shadow',n=gameCount(shard);
  if(!Array.isArray(p?.gameplay)||!Array.isArray(p?.performance)||p.gameplay.length!==n||!eq(p.performance.map(e=>e.value),performanceSizes(shard))||r.gameplayCases!==n||r.admission?.productionAuthorization!==false||!['execute','reuse-shadow'].includes(r.admission.decision))throw Error('Invalid shard coverage: '+shard);
  const historical=expectedMeasurements(p.gameplay),fresh=hit?0:historical;
  if(r.gameplayReused!==hit||r.gameplayExecuted!==!hit||r.freshGameplayCases!==(hit?0:n)||r.reusedGameplayCases!==(hit?n:0)||r.historicalGameplayMeasurements!==historical||r.freshGameplayMeasurements!==fresh||!HEX.test(r.sourceGameplaySemanticDigest)||r.semanticComparison!==(hit?'not-executed':'match')||r.semanticMatch!==(hit?null:true)||r.freshGameplaySemanticDigest!==(hit?null:r.sourceGameplaySemanticDigest)||hit&&r.admission.gameplaySemanticDigest!==r.sourceGameplaySemanticDigest)throw Error('Invalid comparison evidence: '+shard);
  if(r.freshPerformanceCases!==p.performance.length||r.freshPerformanceMeasurements!==2*p.performance.length||!Array.isArray(r.freshPerformanceResults)||r.freshPerformanceResults.length!==p.performance.length||!r.freshPerformanceResults.every((x,i)=>plain(x)&&x.units===p.performance[i].value&&Number.isFinite(x.plannerMs)&&x.plannerMs>=0&&Number.isFinite(x.physicsMs)&&x.physicsMs>=0&&Number.isFinite(x.seconds)&&x.seconds>0&&int(x.snapshotChars)))throw Error('Missing fresh performance: '+shard);
  plans.push(p);freshGameplayCases+=r.freshGameplayCases;reusedGameplayCases+=r.reusedGameplayCases;freshGameplayMeasurements+=fresh;historicalGameplayMeasurements+=historical;freshPerformanceCases+=r.freshPerformanceCases;freshPerformanceMeasurements+=r.freshPerformanceMeasurements;
  perShard.push({shard,decision:r.admission.decision,reason:r.admission.reason??null,changedFields:r.admission.changedFields??[],freshGameplayCases:r.freshGameplayCases,reusedGameplayCases:r.reusedGameplayCases,semanticComparison:r.semanticComparison,freshPerformanceResults:r.freshPerformanceResults});
 }
 if(hash(plans)!==PLAN||freshGameplayCases+reusedGameplayCases!==1868||freshPerformanceCases!==5||freshPerformanceMeasurements!==10||historicalGameplayMeasurements!==3436)throw Error('Incomplete global audited plan');
 return {schema:3,...expected,planDigest:PLAN,shards:8,gameplayCases:1868,freshGameplayCases,reusedGameplayCases,freshGameplayMeasurements,historicalGameplayMeasurements,freshPerformanceCases,freshPerformanceMeasurements,semanticComparison:reusedGameplayCases===1868?'not-executed':reusedGameplayCases===0?'match':'partial-match',perShard,productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
}
function validateReceiptShard(receipt,target,plan){
 if(receipt.shard!==target.shard||receipt.gameplayCases!==plan.shards[target.shard].gameplay.length||receipt.sourceMeasurements!==expectedMeasurements(plan.shards[target.shard].gameplay))throw Error('Signed receipt does not cover target shard');
}
function verifiedReceipt(bundle,path){
 const r=json(path),expected=makeReceipt(bundle,r.issuedAt);
 if(!eq(r,expected))throw Error('Signed receipt differs from original evidence');
 return r;
}
function replayUpstream(m,path){
 if(m.role!=='replay'){if(path)throw Error('Unexpected upstream file');return null;}
 if(!path||process.env.GITHUB_EVENT_NAME!=='workflow_run')throw Error('Missing replay trigger');
 const event=json(process.env.GITHUB_EVENT_PATH),u=json(path);
 const e=event.workflow_run;
 if(event.action!=='completed'||!e||e.id!==u.id||e.run_attempt!==u.run_attempt||e.head_sha!==u.head_sha||e.conclusion!=='success'||e.status!=='completed'||e.head_repository?.full_name!==REPO||e.repository?.full_name!==REPO||e.head_branch!=='main'||e.event!==u.event)throw Error('API run differs from workflow trigger');
 return u;
}
function actualContext(m){
 if(m.shard!==Number(process.env.SHARD)||!/^\d$/.test(process.env.SHARD??'')||m.repository!==process.env.GITHUB_REPOSITORY||m.auditCommit!==process.env.GITHUB_SHA||m.auditTree!==git(process.cwd(),['rev-parse','HEAD^{tree}']).toString().trim()||m.run!==Number(process.env.GITHUB_RUN_ID)||m.attempt!==Number(process.env.GITHUB_RUN_ATTEMPT)||m.ref!==process.env.GITHUB_REF||m.event!==process.env.GITHUB_EVENT_NAME)throw Error('Different actual workflow context');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,...a]=process.argv.slice(2);
  if(mode==='normalize')console.log(JSON.stringify(normalizeScope(...a)));
  else if(mode==='measure')console.log(JSON.stringify(mountedFingerprint(a[0])));
  else if(mode==='check'||mode==='issue'){
   const r=makeReceipt(a[0],Date.now(),mode==='issue');actualContext(r.manifest);
   if(mode==='issue')writeFileSync(a[1],JSON.stringify(r,null,2)+'\n',{flag:'wx'});
   console.log(JSON.stringify(r));
  }else if(mode==='admit'){
   // Caller must first authenticate the exact receipt with gh attestation verify.
   const [bundle,path,targetDir,out,upstreamPath]=a,r=verifiedReceipt(bundle,path),raw=json(join(targetDir,'manifest.json')),t=raw.role==='replay'?validateReplayTarget(raw):validateManifest(raw,'trial');actualContext(t);const p=validatePlan(json(join(targetDir,'plan.json')),t);validateReceiptShard(r,t,p);
   const u=replayUpstream(t,upstreamPath),d=decide(r,t,Date.now(),u);writeFileSync(out,JSON.stringify(d,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(d));
  }else if(mode==='finish'){
   const [bundle,path,dir,admissionPath,out,upstreamPath]=a,r=verifiedReceipt(bundle,path),raw=json(join(dir,'manifest.json')),t=raw.role==='replay'?validateReplayTarget(raw):validateManifest(raw,'trial');actualContext(t);
   const p=validatePlan(json(join(dir,'plan.json')),t),d=json(admissionPath),u=replayUpstream(t,upstreamPath),expected=decide(r,t,Date.now(),u);validateReceiptShard(r,t,p);
   if(!eq(d,expected))throw Error('Admission changed');
   const perf=phaseBundle(dir,'performance',p,t),hit=d.decision==='reuse-shadow';
   const g=hit?null:phaseBundle(dir,'gameplay',p,t);
   if(hit&&readdirSync(dir).includes('gameplay'))throw Error('Ambiguous gameplay execution');
   const report={schema:3,shard:t.shard,source:SOURCE,auditCommit:t.auditCommit,auditTree:t.auditTree,planDigest:PLAN,planShard:p.shards[t.shard],mode:t.role==='replay'?'verified-gameplay-cross-run':'verified-gameplay-trial',sourceRun:r.manifest.run,sourceAttempt:r.manifest.attempt,targetRun:t.run,targetAttempt:t.attempt,admission:d,...summarizeGameplayComparison(r,d,g),freshPerformanceCases:perf.cases,freshPerformanceMeasurements:perf.measurements,freshPerformanceResults:perf.performance,productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
   writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...report,planShard:undefined},null,2));if(report.semanticMatch===false)process.exitCode=1;
  }else if(mode==='aggregate'){
   const [root,out]=a,run=Number(process.env.GITHUB_RUN_ID),attempt=Number(process.env.GITHUB_RUN_ATTEMPT),cross=process.env.GITHUB_EVENT_NAME==='workflow_run';
   if(process.env.MATRIX_RESULT!=='success'||!int(run)||!int(attempt)||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_REPOSITORY!==REPO||!SHA.test(process.env.GITHUB_SHA))throw Error('Incomplete replay matrix');
   const e=cross?json(process.env.GITHUB_EVENT_PATH).workflow_run:null;
   if(cross&&(!e||e.head_sha!==process.env.GITHUB_SHA||e.conclusion!=='success'||e.head_branch!=='main'||e.repository?.full_name!==REPO||e.head_repository?.full_name!==REPO||!int(e.id)||!int(e.run_attempt)))throw Error('Invalid aggregate trigger');
   const prefix=cross?'gameplay-cross-run-':'verified-gameplay-trial-',names=Array.from({length:8},(_,i)=>prefix+attempt+'-'+i);
   if(!eq(readdirSync(root).sort(),names))throw Error('Missing or unexpected matrix artifacts');
   const rows=names.map(n=>{const dir=join(root,n);if(!lstatSync(dir).isDirectory()||!eq(readdirSync(dir),['trial.json']))throw Error('Invalid shard artifact');return json(join(dir,'trial.json'));});
   const report=aggregateReplay(rows,{mode:cross?'verified-gameplay-cross-run':'verified-gameplay-trial',auditCommit:process.env.GITHUB_SHA,auditTree:git(process.cwd(),['rev-parse','HEAD^{tree}']).toString().trim(),sourceRun:cross?e.id:run,sourceAttempt:cross?e.run_attempt:attempt,targetRun:run,targetAttempt:attempt});
   writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
  }else throw Error('Unknown pilot mode');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
