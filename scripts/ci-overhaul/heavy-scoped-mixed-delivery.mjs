// Mixed execution pilot on a controlled child of a signed production source.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,lstatSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual as eq} from 'node:util';
import {compareScope} from './universal-cross-commit.mjs';
import {controlledCommit} from './heavy-cross-commit.mjs';
import {assessScopedCandidate} from './banners-signed-cross-commit-candidate.mjs';
import {discover,verifyDiscoveredCatalog} from './gameplay-receipt-discovery.mjs';
import {issueRenewal,validateRenewalManifest,REPO,RENEWAL_WORKFLOW} from './gameplay-renewal.mjs';
import {normalizeScope,validatePlan,validatePhase,PLAN} from './verified-gameplay-receipt.mjs';
import {digest} from './verified-results.mjs';
import {economicDecision} from './universal-reuse-economics.mjs';
const SOURCE='8c70528d57134a01558a3b9d5bef8d1e34d429a3',ISSUER='3b4294292ba7aed4034231c8bc5ec277073bdfae',RUN=45996361840;
const flags={productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
const fail=s=>{throw Error(s);},pos=n=>Number.isSafeInteger(n)&&n>0;
const git=(r,a)=>execFileSync('git',a,{cwd:r,maxBuffer:70*1024*1024}).toString().trim();
const gh=a=>execFileSync('gh',a,{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
const read=(p,max=128*1024*1024)=>{const s=lstatSync(p);if(!s.isFile()||s.size>max)fail('Unsafe evidence file');return readFileSync(p);};
const json=p=>JSON.parse(read(p,4_000_000));
const put=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const files=(p,n)=>{if(!lstatSync(p).isDirectory()||!eq(readdirSync(p).sort(),[...n].sort()))fail('Unexpected evidence coverage: '+p);};
function context(repo){
 const c={repository:process.env.GITHUB_REPOSITORY,run:Number(process.env.GITHUB_RUN_ID),attempt:Number(process.env.GITHUB_RUN_ATTEMPT),controller:git(repo,['rev-parse','HEAD']),ref:process.env.GITHUB_REF,event:process.env.GITHUB_EVENT_NAME,source:SOURCE,issuer:ISSUER,target:controlledCommit(repo,SOURCE)};
 if(c.repository!==REPO||c.controller!==process.env.GITHUB_SHA||!pos(c.run)||!pos(c.attempt)||c.event!=='pull_request'||!/^refs\/pull\/\d+\/merge$/.test(c.ref))fail('Wrong pilot execution');
 return c;
}
function retrieve(repo,ctx,root){
 const run=JSON.parse(gh(['api','repos/'+REPO+'/actions/runs/'+RUN]));
 const d=discover(SOURCE,ctx.target,root,{list:()=>[run],requiredIssuer:ISSUER});
 if(d.status!=='authenticated-candidate'||d.authenticatedSubjects!==9||d.verifiedBundles!==8||d.sourceRun!==RUN||d.issuer!==ISSUER)fail('Pinned signed catalog unavailable: '+d.reason);
 return d;
}
function auth(repo,dir,shard,now,verifySignatures=true){
 const p=join(dir,'authenticated'),c=json(join(p,'catalog.json')),run=JSON.parse(gh(['api','repos/'+REPO+'/actions/runs/'+RUN]));
 if(c.run!==RUN||c.source!==SOURCE||c.auditCommit!==ISSUER)fail('Wrong pinned source');
 const receipts=Array.from({length:8},(_,i)=>json(join(p,'receipt-'+i+'.json')));
 verifyDiscoveredCatalog(c,receipts,run,SOURCE,git(repo,['rev-parse',SOURCE+'^{tree}']),git(repo,['rev-parse',ISSUER+'^{tree}']),now);
 if(verifySignatures)for(const n of ['catalog.json','receipt-'+shard+'.json'])gh(['attestation','verify',join(p,n),'--repo',REPO,'--cert-identity','https://github.com/'+REPO+'/'+RENEWAL_WORKFLOW+'@refs/heads/main','--source-ref','refs/heads/main','--source-digest',ISSUER,'--deny-self-hosted-runners']);
 const r=receipts[shard],bundle=join(p,'bundles','renewal-bundle-'+run.run_attempt+'-'+shard);
 if(!eq(r,issueRenewal(bundle,r.manifest,r.issuedAt,true)))fail('Original receipt differs');
 return {catalog:c,receipt:r,bundle};
}
function checkTarget(repo,ctx,shard,raw){
 const m=json(join(raw,'manifest.json')),p=json(join(raw,'plan.json'));
 const scope=compareScope(repo,SOURCE,ctx.target,'banners-of-war');
 if(m.source!==ctx.target||m.sourceTree!==scope.currentTree||m.auditCommit!==ISSUER||m.auditTree!==git(repo,['rev-parse',ISSUER+'^{tree}'])||m.run!==ctx.run||m.attempt!==ctx.attempt||m.ref!==ctx.ref||m.event!==ctx.event||m.shard!==shard||!scope.scopeMatch||!scope.distinctTrees||scope.changedScopedPaths.length)fail('Wrong target manifest');
 validateRenewalManifest(m,m,false);const plan=validatePlan(p,m);
 return {m,plan,scope};
}
export function selectMode(candidate,ctx,shard){
 if(!pos(ctx.run)||!pos(ctx.attempt)||!Number.isInteger(shard)||shard<0||shard>7)fail('Invalid shard context');
 if(shard===(ctx.run+ctx.attempt)%8)return {mode:'fresh',reason:'rotating-canary',...flags};
 if(candidate?.decision!=='candidate-only'||candidate.identity!=='scoped-cross-commit')return {mode:'fresh',reason:'candidate-declined',...flags};
 return {mode:'verified-pilot',reason:'scoped-cross-commit',receiptDigest:candidate.receiptDigests[shard],...flags};
}
function decide(repo,ctx,shard,raw,source,now){
 const {m,scope}=checkTarget(repo,ctx,shard,raw);
 const e=auth(repo,source,shard,now);
 const c=assessScopedCandidate(e.catalog,scope,{...m,planDigest:PLAN},now);
 return selectMode(c,ctx,shard);
}
function phase(raw,name,plan,m){
 const dir=join(raw,name);files(dir,['phase.json','records.jsonl']);
 const bytes=read(join(dir,'records.jsonl')),text=bytes.toString('utf8').trim();
 return {...validatePhase(plan,name,json(join(dir,'phase.json')),text?text.split('\n').map(JSON.parse):[],m),recordsDigest:digest(bytes)};
}
function mount(repo,sha,kind){
 const d=mkdtempSync(join(tmpdir(),'pw-mixed-mount-'));
 try{const roots=kind==='source'?['apps/banners-of-war','shared','scripts','package.json','package-lock.json']:['scripts/ci-overhaul'];const b=execFileSync('git',['archive',sha,...roots],{cwd:repo,maxBuffer:70*1024*1024});execFileSync('tar',['-xf','-','-C',d],{input:b});return normalizeScope(repo,sha,d,kind);}finally{rmSync(d,{recursive:true,force:true});}
}
function inspect(repo,ctx,shard,dir,source,now,mounts){
 const raw=join(dir,'raw'),{m,plan,scope}=checkTarget(repo,ctx,shard,raw);
 const e=auth(repo,source,shard,now,false);
 const decision=json(join(dir,'decision.json')),expected=selectMode(assessScopedCandidate(e.catalog,scope,{...m,planDigest:PLAN},now),ctx,shard);
 const hit=decision.mode==='verified-pilot';
 if(hit&&!eq(decision,expected))fail('Invalid scoped hit');
 if(!hit&&(decision.mode!=='fresh'||Object.keys(flags).some(k=>decision[k]!==false)))fail('Invalid fresh fallback');
 const canary=shard===(ctx.run+ctx.attempt)%8;
 if(canary&&hit)fail('Fresh canary skipped');
 files(raw,hit?['manifest.json','plan.json','performance']:['manifest.json','plan.json','performance','gameplay']);
 files(dir,['raw','decision.json','timing.json','mount-proofs']);
 const names=['source','audit'].flatMap(k=>['before','inside','after'].map(s=>k+'-'+s+'.json'));files(join(dir,'mount-proofs'),names);
 for(const kind of ['source','audit']){
  const mm=kind==='source'?m.sourceMount:m.auditMount;
  if(!eq(mm,mounts[kind]))fail('Independent mount differs');
  for(const stage of ['before','inside','after'])if(!eq(mm,json(join(dir,'mount-proofs',kind+'-'+stage+'.json'))))fail('Measured mount differs');
 }
 const perf=phase(raw,'performance',plan,m),game=hit?phase(e.bundle,'gameplay',plan,e.receipt.manifest):phase(raw,'gameplay',plan,m);
 if(game.semanticDigest!==e.receipt.gameplaySemanticDigest)fail('Gameplay semantic mismatch');
 const t=json(join(dir,'timing.json'));
 if(!['preparationMs','authenticationMs','performanceMs','gameplayMs','postVerificationMs'].every(k=>Number.isSafeInteger(t[k])&&t[k]>=0)||hit&&t.gameplayMs!==0||!hit&&t.gameplayMs<=0)fail('Invalid cost timing');
 return {shard,canary,mode:decision.mode,reusedGameplayCases:hit?game.cases:0,freshGameplayCases:hit?0:game.cases,historicalMeasurements:hit?game.measurements:0,freshGameplayMeasurements:hit?0:game.measurements,freshPerformanceCases:perf.cases,freshPerformanceMeasurements:perf.measurements,semanticMatch:hit?null:true,receiptDigest:hit?expected.receiptDigest:null,performanceDigest:perf.recordsDigest,timing:t};
}
export function aggregate(rows,ctx){
 if(!Array.isArray(rows)||rows.length!==8||rows.some((r,i)=>r.shard!==i))fail('Incomplete original shard matrix');
 const sum=k=>rows.reduce((n,r)=>n+r[k],0);
 const canary=(ctx.run+ctx.attempt)%8;
 if(rows[canary].mode!=='fresh'||rows[canary].semanticMatch!==true||sum('reusedGameplayCases')+sum('freshGameplayCases')!==1868||sum('historicalMeasurements')+sum('freshGameplayMeasurements')!==3436||sum('freshPerformanceCases')!==5||sum('freshPerformanceMeasurements')!==10)fail('Lost original case or performance coverage');
 return {schema:1,context:ctx,success:true,expected:8,passed:8,canary,verifiedTasks:rows.filter(r=>r.mode==='verified-pilot').length,freshTasks:rows.filter(r=>r.mode==='fresh').length,reusedGameplayCases:sum('reusedGameplayCases'),freshGameplayCases:sum('freshGameplayCases'),historicalMeasurements:sum('historicalMeasurements'),freshGameplayMeasurements:sum('freshGameplayMeasurements'),freshPerformanceCases:5,freshPerformanceMeasurements:10,rows,economics:economicDecision(null),...flags};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,dir,source,shardText]=process.argv.slice(2),repo=process.cwd(),ctx=context(repo),shard=Number(shardText);
  if(mode==='identity')console.log(JSON.stringify(ctx));
  else if(mode==='discover'){const start=Date.now(),r=retrieve(repo,ctx,dir);put(join(dir,'discovery.json'),r);put(join(dir,'discovery-cost.json'),{authenticationMs:Date.now()-start});}
  else if(mode==='decide'){
   let d;try{d=decide(repo,ctx,shard,dir,source,Date.now());}catch(e){console.error('Fresh fallback: '+e.message.slice(0,200));d={mode:'fresh',reason:'admission-unavailable',...flags};}
   console.log(JSON.stringify(d));
  }else if(mode==='gate'){
   const started=Date.now(),authRoot=mkdtempSync(join(tmpdir(),'pw-mixed-auth-'));
   try{
    retrieve(repo,ctx,authRoot);const authMs=Date.now()-started;
    const names=Array.from({length:8},(_,i)=>'scoped-heavy-'+ctx.attempt+'-'+i);files(dir,names);
    const mounts={source:mount(repo,ctx.target,'source'),audit:mount(repo,ISSUER,'audit')};
    if(!eq(mounts.source,mount(repo,SOURCE,'source')))fail('Original target mount changed');
    const rows=names.map((n,i)=>inspect(repo,ctx,i,join(dir,n),authRoot,Date.now(),mounts));
    const report={...aggregate(rows,ctx),authenticatedSubjects:9,verifiedBundles:8,independentAuthenticationMs:authMs,independentReconstructionMs:Date.now()-started-authMs};
    put(source,report);console.log(JSON.stringify(report,null,2));
   }finally{rmSync(authRoot,{recursive:true,force:true});}
  }else fail('Unknown command');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
