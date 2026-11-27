// Shared Fresh Split boundary for the explicitly isolated verified integration.
import {readFileSync,writeFileSync,lstatSync,readdirSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {isDeepStrictEqual as eq} from 'node:util';
import {makeReceipt,validateManifest,validatePlan,validatePhase,SOURCE,PLAN} from '../ci-overhaul/verified-gameplay-receipt.mjs';
import {decideAdmission,validatePolicyEvidence,POLICY} from '../ci-overhaul/gameplay-admission-policy.mjs';
import {CONTROLLER} from '../ci-overhaul/gameplay-portability-probe.mjs';
const flags={productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
const fail=s=>{throw Error(s);};
const read=(p,max=128*1024*1024)=>{const s=lstatSync(p);if(!s.isFile()||s.size>max)fail('Invalid evidence file');return readFileSync(p,'utf8');};
const json=p=>JSON.parse(read(p,4_000_000));
const jsonl=p=>{const s=read(p).trim();return s?s.split('\n').map(JSON.parse):[];};
export function selectVerifiedShadow(e){
 return e.PW_QA_VERIFIED_SPLIT_SHADOW==='1'&&e.GITHUB_REPOSITORY==='JustSadSock/pocket-works'&&e.GITHUB_EVENT_NAME==='pull_request'&&e.GITHUB_WORKFLOW==='Universal QA Verified Split Integration'&&/^JustSadSock\/pocket-works\/\.github\/workflows\/universal-qa-verified-split\.yml@refs\/pull\/\d+\/merge$/.test(e.GITHUB_WORKFLOW_REF??'')&&isAbsolute(e.PW_QA_VERIFIED_CONTROLLER??'')&&isAbsolute(e.PW_QA_VERIFIED_EVIDENCE??'');
}
function phase(root,name,plan,m){
 const dir=join(root,name);
 if(!eq(readdirSync(dir).sort(),['phase.json','records.jsonl']))fail('Invalid phase files');
 const records=jsonl(join(dir,'records.jsonl')),report=json(join(dir,'phase.json'));
 return {records,report,verified:validatePhase(plan,name,report,records,m)};
}
export function projectVerifiedRows(records,origin){
 if(!['fresh','historical'].includes(origin))fail('Unknown origin');
 const semantic=[],measurements=[];
 for(const row of records){
  const result={...row.result},fields=row.kind==='numerical-superiority'?[]:['historical','performance'].includes(row.kind)?['plannerMs','physicsMs']:['planMs','physicsMs'];
  if(origin==='historical'&&row.kind==='performance')fail('Historical performance is prohibited');
  for(const field of fields){
   if(!Number.isFinite(result[field])||result[field]<0)fail('Missing runtime measurement');
   measurements.push({index:row.index,id:row.id,field,value:result[field],origin});delete result[field];
  }
  semantic.push({...row,result,origin});
 }
 return {semantic,measurements};
}
export function assembleVerifiedShadow(original,shard,root,evidence,output){
 const m=validateManifest(json(join(root,'manifest.json')),'source',false),rawPlan=json(join(root,'plan.json')),p=validatePlan(rawPlan,m);
 if(m.shard!==shard||m.source!==SOURCE||m.auditCommit!==CONTROLLER||original.version!==rawPlan.version||original.plan.planDigest!==PLAN||!eq(original.plan.shards,p.shards))fail('Actual Universal QA plan differs from pinned plan');
 const report=json(join(root,'policy-report.json')),d=report.admission,hit=d?.decision==='reuse-shadow';
 if(report.policy!==POLICY||report.shard!==shard||report.run!==m.run||report.attempt!==m.attempt||report.source!==SOURCE||report.controller!==CONTROLLER||report.planDigest!==PLAN||report.authenticatedBaseline!==true||Object.keys(flags).some(k=>report[k]!==false||d[k]!==false)||!['execute','reuse-shadow'].includes(d.decision))fail('Invalid shadow report');
 const receipt=json(join(evidence,'receipt.json')),sourceDir=join(evidence,'bundle'),sourceManifest=validateManifest(json(join(sourceDir,'manifest.json')),'source');
 if(!eq(receipt,makeReceipt(sourceDir,receipt.issuedAt)))fail('Signed source evidence changed');
 const probe=validatePolicyEvidence(json(join(evidence,'probe.json')),json(join(evidence,'probe-run.json')),json(join(evidence,'pr.json')));
 const upstream=json(join(evidence,'upstream.json')),context={shard,run:m.run,attempt:m.attempt,ref:m.ref,commit:process.env.GITHUB_SHA};
 if(report.commit!==context.commit||!eq(d,decideAdmission(receipt,m,rawPlan,probe,upstream,context)))fail('Shadow admission no longer valid');
 const game=hit?phase(sourceDir,'gameplay',p,sourceManifest):phase(root,'gameplay',p,m),perf=phase(root,'performance',p,m);
 if(hit&&readdirSync(root).includes('gameplay'))fail('Ambiguous reused execution');
 if(game.verified.semanticDigest!==receipt.gameplaySemanticDigest||report.sourceGameplaySemanticDigest!==receipt.gameplaySemanticDigest||report.freshGameplaySemanticDigest!==(hit?null:game.verified.semanticDigest)||report.semanticMatch!==(hit?null:true)||report.semanticComparison!==(hit?'not-executed':'match')||report.reusedGameplayCases!==(hit?game.records.length:0)||report.freshGameplayCases!==(hit?0:game.records.length)||!eq(report.performance,perf.verified.performance))fail('Misclassified verified evidence');
 const gp=projectVerifiedRows(game.records,hit?'historical':'fresh'),pp=projectVerifiedRows(perf.records,'fresh');
 const all=[...gp.semantic,...pp.semantic].sort((a,b)=>a.index-b.index),expected=p.shards[shard].gameplay.concat(p.shards[shard].performance).sort((a,b)=>a.index-b.index);
 if(all.length!==expected.length||all.some((r,i)=>r.index!==expected[i].index||r.id!==expected[i].id||r.kind!==expected[i].kind)||new Set(all.map(r=>r.id)).size!==all.length)fail('Incomplete split coverage');
 const fresh=[...pp.measurements,...(hit?[]:gp.measurements)],historical=hit?gp.measurements:[];
 if(fresh.length!==report.freshGameplayMeasurements+report.freshPerformanceMeasurements||historical.length!==(hit?receipt.sourceMeasurements:0))fail('Measurement provenance mismatch');
 const contract={schema:1,mode:'verified-split-shadow',shard,planDigest:PLAN,gameplayCases:game.records.length,performanceCases:perf.records.length,completed:all.length,freshGameplayCases:report.freshGameplayCases,reusedGameplayCases:report.reusedGameplayCases,freshMeasurements:fresh.length,historicalMeasurements:historical.length,semanticComparison:report.semanticComparison,admission:d,sourceRun:receipt.manifest.run,sourceAttempt:receipt.manifest.attempt,sourceRecordsDigest:receipt.gameplayRecordsDigest,...flags};
 const put=(name,rows)=>writeFileSync(join(output,name),rows.map(r=>JSON.stringify(r)+'\n').join(''),{flag:'wx'});
 // Distinct names prevent legacy readers treating reused timings as fresh.
 put('verified-completion-'+shard+'.jsonl',all);put('fresh-measurements.jsonl',fresh);put('historical-measurements.jsonl',historical);
 writeFileSync(join(output,'verified-split-contract.json'),JSON.stringify(contract,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(contract));return contract;
}
