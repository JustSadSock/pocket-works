// Renewable receipt admission. This is a shadow contract, never a production gate verdict.
import {readFileSync,writeFileSync,lstatSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual as eq} from 'node:util';
import {catalogCandidate,issueRenewal,validateRenewalManifest,REPO,RENEWAL_WORKFLOW} from './gameplay-renewal.mjs';
import {verifyDiscoveredCatalog} from './gameplay-receipt-discovery.mjs';
import {validatePlan,validatePhase,PLAN} from './verified-gameplay-receipt.mjs';
import {digest} from './verified-results.mjs';
import {projectVerifiedRows} from '../universal-qa/verified-split.mjs';
const flags={productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
const SHA=/^[a-f0-9]{40}$/,pos=n=>Number.isSafeInteger(n)&&n>0,fail=s=>{throw Error(s);};
const read=(p,max=128*1024*1024)=>{const st=lstatSync(p);if(!st.isFile()||st.size>max)fail('Invalid evidence file');return readFileSync(p);};
const json=p=>JSON.parse(read(p,4_000_000));
const gh=args=>execFileSync('gh',args,{encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
const api=p=>JSON.parse(gh(['api',p]));
export function decideRenewable(catalog,receipt,target,plan,ctx,now=Date.now()){
 const fresh=reason=>({decision:'execute',reason,...flags});
 try{
  if(!pos(ctx.run)||!pos(ctx.attempt)||!SHA.test(ctx.checkout)||!SHA.test(ctx.controller)||target.run!==ctx.run||target.attempt!==ctx.attempt||target.source!==ctx.checkout||target.auditCommit!==ctx.controller||target.shard!==ctx.shard||target.ref!==ctx.ref||target.event!==ctx.event)fail('Target does not identify actual execution');
  validateRenewalManifest(target,target,false);validatePlan(plan,target);
  if(!catalog||!receipt)fail('No authenticated evidence');
  const r=catalogCandidate(catalog,{...target,planDigest:PLAN},now);
  if(r.decision!=='candidate-only')return fresh(r.reason);
  if(receipt.manifest.shard!==target.shard||r.receiptDigest!==digest(JSON.stringify(receipt))||catalog.shards[target.shard].gameplaySemanticDigest!==receipt.gameplaySemanticDigest)fail('Receipt binding differs');
  if(target.shard===(ctx.run+ctx.attempt)%8)return fresh('Mandatory rotating fresh canary');
  return {decision:'reuse-shadow',reason:null,receiptDigest:r.receiptDigest,sourceRun:catalog.run,sourceAttempt:catalog.attempt,...flags};
 }catch(e){return fresh(e.message);}
}
function phase(root,name,plan,m){
 const dir=join(root,name);
 if(!eq(readdirSync(dir).sort(),['phase.json','records.jsonl']))fail('Unexpected phase files');
 const raw=read(join(dir,'records.jsonl')).toString('utf8').trim(),records=raw?raw.split('\n').map(JSON.parse):[];
 return {records,proof:validatePhase(plan,name,json(join(dir,'phase.json')),records,m)};
}
export function assembleRenewable(root,sourceBundle,receipt,catalog,target,rawPlan,ctx,decision,out,now=Date.now()){
 const plan=validatePlan(rawPlan,target),hit=decision.decision==='reuse-shadow';
 // Admission cannot silently change after a phase started.
 if(!eq(decision,decideRenewable(catalog,receipt,target,rawPlan,ctx,now)))fail('Admission changed; fresh retry required');
 const perf=phase(root,'performance',plan,target),game=hit?phase(sourceBundle,'gameplay',plan,receipt.manifest):phase(root,'gameplay',plan,target);
 if(hit&&(readdirSync(root).includes('gameplay')||game.proof.semanticDigest!==receipt.gameplaySemanticDigest))fail('Invalid historical gameplay');
 const comparison=hit?'not-executed':receipt&&catalog&&catalog.source===target.source&&catalog.sourceTree===target.sourceTree&&catalog.auditCommit===target.auditCommit&&eq(receipt.manifest.sourceMount,target.sourceMount)&&eq(receipt.manifest.auditMount,target.auditMount)?(game.proof.semanticDigest===receipt.gameplaySemanticDigest?'match':'mismatch'):'no-comparable-baseline';
 if(comparison==='mismatch')fail('Fresh gameplay differs from comparable signed baseline');
 const g=projectVerifiedRows(game.records,hit?'historical':'fresh'),p=projectVerifiedRows(perf.records,'fresh'),rows=[...g.semantic,...p.semantic].sort((a,b)=>a.index-b.index);
 const expected=plan.shards[target.shard].gameplay.concat(plan.shards[target.shard].performance).sort((a,b)=>a.index-b.index);
 if(rows.length!==expected.length||rows.some((r,i)=>r.id!==expected[i].id||r.index!==expected[i].index||r.kind!==expected[i].kind))fail('Lost original case coverage');
 const fresh=[...p.measurements,...(hit?[]:g.measurements)],historical=hit?g.measurements:[];
 const report={schema:1,mode:'renewable-admission-shadow',shard:target.shard,run:ctx.run,attempt:ctx.attempt,source:target.source,sourceTree:target.sourceTree,controller:target.auditCommit,controllerTree:target.auditTree,planDigest:PLAN,admission:decision,gameplayCases:game.records.length,freshGameplayCases:hit?0:game.records.length,reusedGameplayCases:hit?game.records.length:0,freshPerformanceCases:perf.records.length,freshPerformanceMeasurements:p.measurements.length,freshMeasurements:fresh.length,historicalMeasurements:historical.length,semanticComparison:comparison,semanticMatch:comparison==='match'?true:null,...flags};
 for(const [n,a] of [['verified-gameplay.jsonl',rows],['fresh-measurements.jsonl',fresh],['historical-measurements.jsonl',historical]])writeFileSync(join(out,n),a.map(x=>JSON.stringify(x)+'\n').join(''),{flag:'wx'});
 writeFileSync(join(out,'admission-report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));return report;
}
function authenticated(dir,target,now){
 const p=join(dir,'authenticated'),catalog=json(join(p,'catalog.json')),run=api('repos/'+REPO+'/actions/runs/'+catalog.run);
 const tree=sha=>{const j=api('repos/'+REPO+'/git/commits/'+sha);if(j.sha!==sha||!SHA.test(j.tree?.sha))fail('Invalid Git identity');return j.tree.sha;};
 const receipts=Array.from({length:8},(_,i)=>json(join(p,'receipt-'+i+'.json')));
 verifyDiscoveredCatalog(catalog,receipts,run,catalog.source,tree(catalog.source),tree(run.head_sha),now);
 // Independently verify the subjects used for this task, not a marker supplied by discovery.
 for(const n of ['catalog.json','receipt-'+target.shard+'.json'])gh(['attestation','verify',join(p,n),'--repo',REPO,'--cert-identity','https://github.com/'+REPO+'/'+RENEWAL_WORKFLOW+'@refs/heads/main','--source-ref','refs/heads/main','--source-digest',run.head_sha,'--deny-self-hosted-runners']);
 const receipt=receipts[target.shard],bundle=join(p,'bundles','renewal-bundle-'+run.run_attempt+'-'+target.shard);
 if(!eq(receipt,issueRenewal(bundle,receipt.manifest,receipt.issuedAt,true)))fail('Receipt changed since discovery');
 return {catalog,receipt,bundle};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,root,discovery,out,decisionPath]=process.argv.slice(2),target=json(join(root,'manifest.json')),plan=json(join(root,'plan.json'));
  const ctx={run:Number(process.env.GITHUB_RUN_ID),attempt:Number(process.env.GITHUB_RUN_ATTEMPT),checkout:process.env.ACTUAL_QA_SOURCE,controller:process.env.ACTUAL_QA_CONTROLLER,shard:Number(process.env.SHARD),ref:process.env.GITHUB_REF,event:process.env.GITHUB_EVENT_NAME};
  if(process.env.GITHUB_REPOSITORY!==REPO||!pos(ctx.run)||!pos(ctx.attempt)||target.source!==ctx.checkout||target.auditCommit!==ctx.controller||target.run!==ctx.run||target.attempt!==ctx.attempt||target.shard!==ctx.shard||target.ref!==ctx.ref||target.event!==ctx.event)fail('Wrong actual execution');
  validateRenewalManifest(target,target,false);validatePlan(plan,target);
  let e={};try{e=authenticated(discovery,target,Date.now());}catch(err){console.log('Evidence declined: '+String(err.message).slice(0,200));}
  const d=decideRenewable(e.catalog,e.receipt,target,plan,ctx);
  if(mode==='admit'){writeFileSync(out,JSON.stringify(d,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(d));}
  else if(mode==='finish'){
   const before=json(decisionPath);
   if(before.decision==='execute'&&d.decision==='reuse-shadow'){e={};} // no promotion after fresh execution
   assembleRenewable(root,e.bundle,e.receipt,e.catalog,target,plan,ctx,before,out);
  }else fail('Unknown admission command');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
