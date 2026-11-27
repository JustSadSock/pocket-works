// Whole-matrix economics. All observations are advisory; no QA route changes.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {POLICY} from './universal-reuse-economics.mjs';
const REPO='JustSadSock/pocket-works',SOURCE='8c70528d57134a01558a3b9d5bef8d1e34d429a3',TARGET='ce4bc09ba2a105f6e8db0a8a0153da079f4e2c5f',ISSUER='3b4294292ba7aed4034231c8bc5ec277073bdfae';
const flags={productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
const pos=x=>Number.isSafeInteger(x)&&x>0,fail=s=>{throw Error(s);};
const gh=a=>execFileSync('gh',a,{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});
const api=p=>JSON.parse(gh(['api','repos/'+REPO+'/'+p]));
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const HISTORICAL_SUMMARY='fbdcc27be4eb2124f2b9275967654866ef3eeaae7c1e36af3d50d41f65c60135';
export function validateHistoricalFresh(g){
 if(g?.schema!==1||g.success!==true||g.expected!==21||g.passed!==21||g.failed!==0||!Array.isArray(g.missing)||g.missing.length||!Array.isArray(g.results)||g.results.length!==21||new Set(g.results.map(r=>r.key)).size!==21||g.results.some(r=>r.app!=='banners-of-war'||r.schema!==1||r.success!==true||r.exitCode!==0||r.signal!==null||r.timedOut!==false||r.verificationMode!==undefined||!pos(r.durationMs)))fail('Invalid legacy fresh results');
 for(let i=0;i<8;i++){const r=g.results.find(r=>r.key==='banners-of-war-completion-lab-'+i);if(!r||r.kind!=='node'||r.suite!=='completion-lab'||r.seed!==i||r.install!==false)fail('Missing original fresh shard');}
 return true;
}
export function qualifyCosts(fresh,mixed,renewalMs,now){
 const deny=reason=>({decision:'fresh',reason,...flags});
 if(!pos(now)||!pos(renewalMs)||!Array.isArray(fresh)||!Array.isArray(mixed)||fresh.length<POLICY.minSamples||mixed.length<POLICY.minSamples)return deny('Insufficient whole-matrix evidence');
 const valid=x=>x&&typeof x.id==='string'&&x.id.length&&pos(x.costMs)&&pos(x.observedAt)&&x.observedAt<=now&&now-x.observedAt<=POLICY.maxSampleAgeMs&&x.source===SOURCE&&x.target===TARGET&&x.issuer===ISSUER;
 for(const list of [fresh,mixed])if(!list.every(valid)||new Set(list.map(x=>x.id)).size!==list.length)return deny('Incompatible, duplicate or stale matrix observations');
 const lower=Math.min(...fresh.map(x=>x.costMs)),upper=Math.max(...mixed.map(x=>x.costMs)),hits=mixed.length;
 const issuanceShareMs=Math.ceil(renewalMs/hits),net=upper+issuanceShareMs,savings=lower-net,bps=Math.floor(savings/lower*10000);
 const metrics={freshLowerMs:lower,mixedUpperMs:upper,renewalMs,observedMixedExecutions:hits,issuanceShareMs,netMixedUpperMs:net,savingsMs:savings,savingsBasisPoints:bps};
 return {decision:savings>=POLICY.minSavingsMs&&bps>=POLICY.minSavingsBasisPoints?'cost-qualified-candidate':'fresh',reason:'Conservative historical whole-matrix economics; future hits are not guaranteed',...metrics,...flags};
}
function run(id,path,sha,attempt,current=false){
 const r=api('actions/runs/'+id);
 if(r.id!==id||r.repository?.full_name!==REPO||r.head_repository?.full_name!==REPO||r.path!==path||sha&&r.head_sha!==sha||r.run_attempt<attempt||(!current&&(r.status!=='completed'||r.conclusion!=='success'))||current&&r.run_attempt!==attempt)fail('Unexpected workflow identity: '+id);
 const j=api('actions/runs/'+id+'/attempts/'+attempt+'/jobs?per_page=100');
 if(j.total_count!==j.jobs.length)fail('Incomplete job page');
 return {r,jobs:j.jobs};
}
function duration(job){
 const a=Date.parse(job?.started_at),b=Date.parse(job?.completed_at);
 if(job?.conclusion!=='success'||!Number.isFinite(a)||!Number.isFinite(b)||b<=a)fail('Invalid job duration: '+job?.name);
 return b-a;
}
function named(jobs,name){
 const j=jobs.filter(x=>x.name===name);if(j.length!==1)fail('Missing or duplicate job: '+name);return duration(j[0]);
}
function matrix(jobs,name){
 return Array.from({length:8},(_,i)=>named(jobs,name(i))).reduce((a,b)=>a+b,0);
}
function observe(id,attempt,costMs,r,extra={}){
 return {id:id+':'+attempt,costMs,observedAt:Date.parse(r.created_at),source:SOURCE,target:TARGET,issuer:ISSUER,...extra};
}
function verifyMixed(g,id,attempt,fullFresh=false){
 if(g?.context?.run!==id||g.context.attempt!==attempt||g.context.source!==SOURCE||g.context.target!==TARGET||g.context.issuer!==ISSUER||g.success!==true||g.passed!==8||g.authenticatedSubjects!==9||g.verifiedBundles!==8||g.reusedGameplayCases+g.freshGameplayCases!==1868||g.freshPerformanceCases!==5||g.freshPerformanceMeasurements!==10||g.historicalMeasurements+g.freshGameplayMeasurements!==3436||g.productionAuthorization!==false||g.allowResultReuse!==false||g.allowImpactSkipping!==false||!Array.isArray(g.rows)||g.rows.length!==8||g.rows.some((r,i)=>r.shard!==i))fail('Invalid independent gate evidence');
 if(fullFresh?(g.verifiedTasks!==0||g.freshTasks!==8||g.rows.some(r=>r.mode!=='fresh'||r.semanticMatch!==true)):(g.verifiedTasks!==7||g.freshTasks!==1||g.rows[g.canary]?.semanticMatch!==true||g.rows[g.canary]?.mode!=='fresh'))fail('Wrong execution coverage');
 return g;
}
function download(id,name,expectedDigest=null){
 const d=mkdtempSync(join(tmpdir(),'pw-economic-'));
 try{gh(['run','download',String(id),'--repo',REPO,'--name',name,'--dir',d]);const b=readFileSync(join(d,name.startsWith('qa-summary')?'summary.json':'verdict.json'));if(expectedDigest&&hash(b)!==expectedDigest)fail('Pinned historical artifact bytes changed');return JSON.parse(b);}
 finally{rmSync(d,{recursive:true,force:true});}
}
function historicalMixed(id){
 const path='.github/workflows/heavy-scoped-mixed-delivery.yml',sha='5fd6b3a681bff19aa11f621df6459371083d2b97';
 const {r,jobs}=run(id,path,sha,1);
 if(r.event!=='pull_request'||r.head_branch!=='infra/heavy-scoped-mixed-delivery')fail('Wrong historical mixed branch');
 const g=verifyMixed(download(id,'heavy-scoped-mixed-gate-1'),id,1);
 const shards=matrix(jobs,i=>'execute ('+i+')'),total=shards+['contract','prepare','independent_gate','required_gate'].reduce((n,k)=>n+named(jobs,k),0);
 return observe(id,1,total,r,{shardsMs:shards,canary:g.canary,coverage:1868});
}
function historicalFresh(){
 const qa=run(46000572518,'.github/workflows/universal-qa.yml','b56a9024a15aa817675ca0e85fa10c229238c149',1);
 const g=download(46000572518,'qa-summary-46000572518-1',HISTORICAL_SUMMARY);
 if(qa.r.head_branch!=='app/banners-of-war'||qa.r.event!=='pull_request')fail('Original fresh QA identity differs');
 validateHistoricalFresh(g);
 const gate=qa.jobs.find(j=>j.id===140515695701);
 duration(gate);
 // The legacy summary lacks source identity. Pin the original archive and
 // the independently completed gate job in the exact attempt, rather than
 // relying on the presentation format of gh run view --log.
 const artifacts=api('actions/runs/46000572518/artifacts?name=qa-summary-46000572518-1&per_page=100');
 const match=artifacts.artifacts.filter(a=>a.name==='qa-summary-46000572518-1');
 if(match.length!==1||match[0].id!==15197928969||match[0].expired!==false||match[0].size_in_bytes!==1677)fail('Original gate artifact identity differs');
 const archive=execFileSync('gh',['api','repos/'+REPO+'/actions/artifacts/15197928969/zip'],{timeout:60000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
 if(hash(archive)!=='46db020484156e74185837e6abd1a5acc562b5e059a91d951ccedac0def9bb58')fail('Original gate archive digest differs');
 if(gate.id!==140515695701||gate.run_id!==46000572518||(gate.run_attempt!==undefined&&gate.run_attempt!==1))fail('Original independent gate job differs');
 const commit=api('git/commits/'+SOURCE);if(commit.sha!==SOURCE||commit.tree?.sha!=='1e450f71ba0f02b69c9b481e6ef033baa2795d3e'||commit.parents?.[1]?.sha!==qa.r.head_sha)fail('Historical source commit differs');
 const baseline=matrix(qa.jobs,i=>'cpu (banners-of-war-completion-lab-'+i+', banners-of-war, completion-lab, node, '+i+', false)');
 const renewal=run(45996361840,'.github/workflows/gameplay-receipt-renewal.yml',ISSUER,2);
 if(renewal.r.head_branch!=='main'||renewal.r.event!=='push')fail('Wrong catalog issuer');
 const shards=matrix(renewal.jobs,i=>'execute ('+i+')'),renewalMs=shards+['contract','select','catalog','attest'].reduce((n,k)=>n+named(renewal.jobs,k),0);
 return {fresh:[observe(46000572518,1,baseline,qa.r,{route:'original-fresh-QA'}),observe(45996361840,2,shards,renewal.r,{route:'signed-fresh-catalog'})],renewalMs};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mixedFile,freshFile,out]=process.argv.slice(2),replay=mixedFile==='replay',id=replay?46050831661:Number(process.env.GITHUB_RUN_ID),attempt=replay?1:Number(process.env.GITHUB_RUN_ATTEMPT);
  if(process.env.GITHUB_REPOSITORY!==REPO||!pos(id)||!pos(attempt))fail('Wrong economic context');
  const current=run(id,'.github/workflows/banners-cross-commit-economic-qualification.yml',null,attempt,true);
  if(current.r.head_branch!=='infra/banners-cross-commit-economic-qualification'||current.r.event!=='pull_request')fail('Wrong economic workflow branch');
  const m=verifyMixed(replay?download(id,'economic-gate-mixed-1','c581c8608c364a99d83451733b8ec6eec648eec5566b98d636cf10449000333f'):json(mixedFile),id,attempt),f=verifyMixed(replay?download(id,'economic-gate-fresh-1','9f5f5a0b6a8bfbd36f82a711fb4a3d733d770b5d65020d56939d5a9aeed0e4ee'):json(freshFile),id,attempt,true);
 if(replay){if(current.r.head_sha!=='34294d54a7d15f5f5782641eb0008295456b819c'||current.r.status!=='completed'||current.r.conclusion!=='failure')fail('Wrong archived run');named(current.jobs,'independent_gate (mixed)');named(current.jobs,'independent_gate (fresh)');}
  const {fresh,renewalMs}=historicalFresh(),mixed=[historicalMixed(46042032971),historicalMixed(46042030854)];
  const freshJobs=matrix(current.jobs,i=>'execute (fresh, '+i+')');
  const freshExecution=f.rows.reduce((n,r)=>n+r.timing.gameplayMs+r.timing.performanceMs,0);
  if(!pos(freshExecution)||freshExecution>freshJobs)fail('Fresh execution exceeds measured runner time');
  // Use actual gameplay+performance only as a conservative lower baseline.
  fresh.push(observe(id,attempt,freshExecution,current.r,{route:'controlled-fresh',shardsMs:freshJobs}));
  const mixedShards=matrix(current.jobs,i=>'execute (mixed, '+i+')');
  // Charge full shared setup, mixed gate, and bounded costs of economics plus
  // final gate (each timeout two minutes). Do not charge the experimental
  // fully-fresh control matrix to the future mixed production path.
  const upper=mixedShards+['contract','prepare','independent_gate (mixed)'].reduce((n,k)=>n+named(current.jobs,k),0)+240000;
  mixed.push(observe(id,attempt,upper,current.r,{shardsMs:mixedShards,canary:m.canary,remainingJobBudgetMs:240000}));
  const decision=qualifyCosts(fresh,mixed,renewalMs,Date.now());
  if(qualifyCosts(fresh.slice(1),mixed,renewalMs,Date.now()).decision!=='fresh'||qualifyCosts(fresh,[mixed[0],mixed[0],mixed[2]],renewalMs,Date.now()).decision!=='fresh')fail('Economic negative control failed');
  const report={schema:1,source:SOURCE,target:TARGET,issuer:ISSUER,run:id,attempt,fresh,mixed,decision,negativeControls:2,...flags};
  writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
 }catch(e){console.error(e.message);process.exitCode=1;}
}
