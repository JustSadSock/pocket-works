// Mandatory delivery verifier for a mixture of original fresh tasks and authenticated gameplay hits.
import {readFileSync,lstatSync,existsSync,mkdirSync,mkdtempSync,rmSync,writeFileSync,appendFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual as eq} from 'node:util';
import {describePlan,verifyLegacy} from './delivery-gate.mjs';
import {verdict} from './canary-evidence.mjs';
import {taskDigest,canonical,digest} from './verified-results.mjs';
import {loadSuites,resolveTasks} from '../universal-qa/plan.mjs';
import {selectSplit} from '../universal-qa/fresh-split.mjs';
import {REPO} from './gameplay-renewal.mjs';
const SHA=/^[a-f0-9]{40}$/,pos=n=>Number.isSafeInteger(n)&&n>0,fail=s=>{throw Error(s);};
const flags=['productionAuthorization','allowResultReuse','allowImpactSkipping'];
const json=p=>{const st=lstatSync(p);if(!st.isFile()||st.size>4_000_000)fail('Invalid delivery evidence');return JSON.parse(readFileSync(p,'utf8'));};
export function eligibleTask(t){
 return t?.app==='banners-of-war'&&t.suite==='completion-lab'&&t.kind==='node'&&t.install===false&&Number.isInteger(t.seed)&&t.seed>=0&&t.seed<8&&t.key==='banners-of-war-completion-lab-'+t.seed;
}
export function eligibleDelivery(env){
 return env.GITHUB_REPOSITORY===REPO&&env.GITHUB_EVENT_NAME==='pull_request'&&env.GITHUB_REF==='refs/pull/1355/merge'&&env.QA_PR_NUMBER==='1355'&&env.QA_HEAD_REPO===REPO&&env.QA_HEAD_REF==='app/banners-of-war'&&env.PW_QA_PRODUCTION_VERIFIED==='1';
}
export function validateHit(t,p,ctx,hit){
 const n=t.seed<4?234:233,perf=[0,4,5,6,7].includes(t.seed)?1:0;
 if(!eligibleTask(t)||!ctx.enabled||!SHA.test(ctx.source)||!SHA.test(ctx.tree)||!pos(ctx.run)||!pos(ctx.attempt)||p?.schema!==1||p.independentlyVerified!==true||p.run!==ctx.run||p.attempt!==ctx.attempt||p.source!==ctx.source||p.sourceTree!==ctx.tree||!SHA.test(p.controller)||!SHA.test(p.controllerTree)||p.controller!==hit?.controller||p.controllerTree!==hit?.controllerTree||p.shard!==t.seed||p.reusedGameplayCases!==n||p.freshGameplayCases!==0||p.freshPerformanceCases!==perf||p.freshPerformanceMeasurements!==perf*2||!['exact-commit','exact-tree-merge'].includes(p.identity)||flags.some(k=>p[k]!==false)||t.seed===(ctx.run+ctx.attempt)%8)fail('Verified task did not qualify: '+t.key);
 return n;
}
export function verifyMixed(raw,ctx,readTask,auditTask){
 const p=describePlan(raw);
 if(!p.count||!SHA.test(ctx.tree)||!SHA.test(ctx.source)||!pos(ctx.run)||!pos(ctx.attempt))fail('Invalid original delivery plan');
 let reused=0,verified=0;const rows=[],passed=[];
 for(const t of p.tasks){
  const {fresh,hit}=readTask(t);
  if(!!fresh===!!hit)fail('Missing or ambiguous task evidence: '+t.key);
  if(fresh){
   if(fresh.verificationMode!==undefined||!verdict([t],[fresh],ctx.tree).success)fail('Invalid fresh task: '+t.key);
   rows.push({key:t.key,mode:'fresh',reusedGameplayCases:0});
  }else{
   if(!ctx.enabled||!eligibleTask(t)||hit.schema!==1||hit.mode!=='production-verified-gameplay-v1'||!eq(hit.task,t)||hit.taskDigest!==taskDigest(t)||hit.run!==ctx.run||hit.attempt!==ctx.attempt||hit.source!==ctx.source||hit.tree!==ctx.tree||!SHA.test(hit.controller)||!SHA.test(hit.controllerTree))fail('Unapproved verified task envelope');
   const proof=auditTask(t,hit);
   const n=validateHit(t,proof,ctx,hit);reused+=n;verified++;
   rows.push({key:t.key,mode:'verified-gameplay',reusedGameplayCases:n,identity:proof.identity,controller:proof.controller,controllerTree:proof.controllerTree,freshPerformanceCases:proof.freshPerformanceCases,freshPerformanceMeasurements:proof.freshPerformanceMeasurements});
  }
  passed.push(taskDigest(t));
 }
 if(digest(canonical(passed.sort()))!==p.planDigest)fail('Original task digest mismatch');
 return {schema:1,route:'legacy-mixed-v1',tree:ctx.tree,source:ctx.source,run:ctx.run,attempt:ctx.attempt,planDigest:p.planDigest,expected:p.count,passed:p.count,success:true,verifiedTasks:verified,freshTasks:p.count-verified,reusedGameplayCases:reused,productionAuthorization:verified>0,allowImpactSkipping:false,rows};
}
export function verifyGateSummary(raw,summary,ctx){
 const p=describePlan(raw);
 if(summary?.route!=='legacy-mixed-v1')return verifyLegacy(raw,summary,ctx.tree);
 if(summary.schema!==1||summary.success!==true||summary.source!==ctx.source||summary.tree!==ctx.tree||summary.run!==ctx.run||summary.attempt!==ctx.attempt||summary.planDigest!==p.planDigest||summary.expected!==p.count||summary.passed!==p.count||summary.allowImpactSkipping!==false||!Array.isArray(summary.rows)||summary.rows.length!==p.count)fail('Mandatory summary identity or coverage mismatch');
 const tasks=new Map(p.tasks.map(t=>[t.key,t])),seen=new Set();let verified=0,reused=0;
 for(const r of summary.rows){
  const t=tasks.get(r.key);if(!t||seen.has(r.key))fail('Unexpected task in mandatory summary');seen.add(r.key);
  if(r.mode==='fresh'){if(r.reusedGameplayCases!==0)fail('Fresh task claims reuse');}
  else if(r.mode==='verified-gameplay'){
   const n=t.seed<4?234:233;
   const perf=[0,4,5,6,7].includes(t.seed)?1:0;
   if(!ctx.enabled||!eligibleTask(t)||!['exact-commit','exact-tree-merge'].includes(r.identity)||!SHA.test(r.controller)||!SHA.test(r.controllerTree)||r.reusedGameplayCases!==n||r.freshPerformanceCases!==perf||r.freshPerformanceMeasurements!==perf*2||t.seed===(ctx.run+ctx.attempt)%8)fail('Unapproved mandatory summary hit');
   verified++;reused+=n;
  }else fail('Unknown mandatory summary mode');
 }
 if(summary.verifiedTasks!==verified||summary.freshTasks!==p.count-verified||summary.reusedGameplayCases!==reused||summary.productionAuthorization!==(verified>0))fail('Mandatory summary totals differ');
 return {success:true,expected:p.count,planDigest:p.planDigest,verifiedTasks:verified,reusedGameplayCases:reused};
}
function checkTask(root,t){
 if(!eligibleTask(t))return false;
 try{
  const s=loadSuites(root,t.app).find(s=>s.id===t.suite),original=resolveTasks(root,{apps:[t.app],suite:t.suite,profile:'deep'}).find(x=>x.key===t.key);
  return eq(t,original)&&selectSplit(root,t,s);
 }catch{return false;}
}
const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const context=root=>({enabled:eligibleDelivery(process.env),source:git(root,['rev-parse','HEAD']),tree:git(root,['rev-parse','HEAD^{tree}']),run:Number(process.env.GITHUB_RUN_ID),attempt:Number(process.env.GITHUB_RUN_ATTEMPT)});
const rawFromEnv=e=>'cpu_matrix='+e.QA_CPU_MATRIX+'\nbrowser_matrix='+e.QA_BROWSER_MATRIX+'\nexpected='+e.QA_EXPECTED+'\n';
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,root,arg,extra]=process.argv.slice(2),ctx=context(root);
  if(mode==='eligible'){
   const t=JSON.parse(process.env.PW_QA_TASK);
   if(!ctx.enabled||!checkTask(root,t)||ctx.source!==process.env.GITHUB_SHA)process.exitCode=75;
  }else if(mode==='seal'){
   const t=JSON.parse(process.env.PW_QA_TASK),r=json(join(arg,'admission-report.json'));
   if(!ctx.enabled||!checkTask(root,t)||ctx.source!==process.env.GITHUB_SHA||r.source!==ctx.source||r.sourceTree!==ctx.tree||r.run!==ctx.run||r.attempt!==ctx.attempt||r.shard!==t.seed||r.admission?.decision!=='reuse-shadow'||r.controller!==process.env.ACTUAL_QA_CONTROLLER||r.controllerTree!==process.env.ACTUAL_QA_CONTROLLER_TREE||!SHA.test(r.controller)||!SHA.test(r.controllerTree)||flags.some(k=>r[k]!==false))fail('Cannot seal non-reuse output');
   writeFileSync(join(arg,'verified-delivery.json'),JSON.stringify({schema:1,mode:'production-verified-gameplay-v1',task:t,taskDigest:taskDigest(t),run:ctx.run,attempt:ctx.attempt,source:ctx.source,tree:ctx.tree,controller:r.controller,controllerTree:r.controllerTree},null,2)+'\n',{flag:'wx'});
  }else if(mode==='mixed'){
   if(ctx.source!==process.env.GITHUB_SHA)fail('Wrong delivery checkout');
   const raw=rawFromEnv(process.env),p=describePlan(raw),dirs=new Set(p.tasks.map(t=>'qa-'+t.key));
   // Reject unexpected task artifacts; summary is created only after verification.
   const {readdirSync}=await import('node:fs');
   if(readdirSync(arg).some(n=>!dirs.has(n)))fail('Unexpected task artifact');
   const result=verifyMixed(raw,ctx,t=>{const d=join(arg,'qa-'+t.key),fresh=join(d,'result.json'),hit=join(d,'verified-delivery.json');return {fresh:existsSync(fresh)?json(fresh):null,hit:existsSync(hit)?json(hit):null};},(t)=>{
    if(!checkTask(root,t))fail('Actual checkout no longer matches audited split');
    const d=join(arg,'qa-'+t.key),manifest=json(join(d,'raw','manifest.json')),temp=mkdtempSync(join(tmpdir(),'pw-delivery-audit-'));
    try{
     if(manifest.source!==ctx.source||manifest.sourceTree!==ctx.tree||manifest.run!==ctx.run||manifest.attempt!==ctx.attempt||manifest.shard!==t.seed)fail('Wrong raw task identity');
     execFileSync(process.execPath,[join(process.cwd(),'scripts/ci-overhaul/gameplay-renewable-admission.mjs'),'audit',join(d,'raw'),resolve(extra),temp,d],{stdio:'inherit',env:{...process.env,SHARD:String(t.seed),ACTUAL_QA_SOURCE:ctx.source,ACTUAL_QA_CONTROLLER:manifest.auditCommit}});
     return json(join(temp,'gate-candidate.json'));
    }finally{rmSync(temp,{recursive:true,force:true});}
   });
   writeFileSync(join(arg,'summary.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
   const md='## Pocket Works Universal QA — mandatory mixed delivery\n\n'+result.passed+'/'+result.expected+' tasks passed; '+result.verifiedTasks+' verified tasks; '+result.reusedGameplayCases+' reused gameplay cases.\n';
   writeFileSync(join(arg,'SUMMARY.md'),md,{flag:'wx'});if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,md);console.log(JSON.stringify(result,null,2));
  }else if(mode==='gate-report'){
   if(ctx.source!==process.env.GITHUB_SHA)fail('Wrong final gate checkout');
   const raw=rawFromEnv(process.env),p=describePlan(raw);
   if(p.planDigest!==process.env.QA_PLAN_DIGEST)fail('Final gate plan digest differs');
   const bytes=readFileSync(arg);
   if(digest(bytes)!==process.env.QA_REPORT_DIGEST)fail('Mandatory report changed after independent summary');
   console.log(JSON.stringify(verifyGateSummary(raw,JSON.parse(bytes),ctx)));
  }else fail('Unknown delivery operation');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
