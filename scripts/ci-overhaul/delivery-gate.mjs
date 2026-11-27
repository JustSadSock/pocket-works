// Stable delivery verdict. Default is the complete legacy plan; neither
// historical results nor dependency/impact skipping can satisfy this gate.
import {readFileSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {shadowFromLegacy} from './sharding.mjs';
import {canonical,digest,taskDigest} from './verified-results.mjs';
import {verdict} from './canary-evidence.mjs';
import {REPO,APP_PR,APP_BRANCH} from './gameplay-renewal.mjs';

export function describePlan(raw){
 const p=shadowFromLegacy(raw);
 const tasks=p.shards.flatMap(s=>s.tasks);
 return {tasks,count:tasks.length,planDigest:digest(canonical(tasks.map(taskDigest).sort())),
  hasCpu:tasks.some(t=>['node','node-test'].includes(t.kind)),
  hasBrowser:tasks.some(t=>['visual','playwright','browser-node'].includes(t.kind))};
}

export function isApprovedBannersPullRequest(event,repository){
 const p=event?.pull_request;
 return repository===REPO&&p?.number===APP_PR&&
  p.head?.repo?.full_name===REPO&&p.head?.ref===APP_BRANCH&&
  p.base?.repo?.full_name===REPO&&p.base?.ref==='main';
}

export function selectDeliveryRoute({policy,request,eventName,sameRepo,count,forceLegacy=false}){
 if(!Number.isSafeInteger(count)||count<0)throw Error('Invalid task count');
 if(count===0)return 'no-app-suites';
 // The approved Banners PR must pass the legacy mandatory mixed-delivery gate;
 // the repository-wide sharded route remains unchanged for every other PR.
 if(forceLegacy===true)return 'legacy';
 return policy?.schema===1&&policy.enabled===true&&policy.allowResultReuse===false&&
   policy.allowImpactSkipping===false&&request==='sharded'&&eventName==='pull_request'&&sameRepo===true
   ?'sharded':'legacy';
}

export function assertDelivery({plan,route,count,hasCpu,hasBrowser,legacyCpu,legacyBrowser,summary,candidate}){
 if(plan!=='success'||!Number.isSafeInteger(count)||count<0||
   typeof hasCpu!=='boolean'||typeof hasBrowser!=='boolean'||
   (count>0)!==(hasCpu||hasBrowser))throw Error('Invalid or unsuccessful delivery plan');
 const expect=(actual,expected,label)=>{if(actual!==expected)throw Error(label+' expected '+expected+', received '+actual);};
 if(route==='no-app-suites'){
  expect(count,0,'App task count');expect(legacyCpu,'skipped','CPU');expect(legacyBrowser,'skipped','Browser');
  expect(summary,'skipped','Legacy summary');expect(candidate,'skipped','Candidate');
 }else if(route==='legacy'&&count>0){
  expect(legacyCpu,hasCpu?'success':'skipped','CPU');expect(legacyBrowser,hasBrowser?'success':'skipped','Browser');
  expect(summary,'success','Legacy summary');expect(candidate,'skipped','Candidate');
 }else if(route==='sharded'&&count>0){
  expect(legacyCpu,'skipped','Legacy CPU');expect(legacyBrowser,'skipped','Legacy browser');
  expect(summary,'skipped','Legacy summary');expect(candidate,'success','Candidate');
 }else throw Error('Unknown or contradictory delivery route');
 return {route,count,success:true,coverage:count?'all-original-app-suites':'no-app-suites'};
}

export function verifyLegacy(raw,summary,tree){
 const p=describePlan(raw);
 if(!p.count||summary?.schema!==1||summary.success!==true||summary.expected!==p.count||
   summary.passed!==p.count||summary.failed!==0||!Array.isArray(summary.missing)||summary.missing.length)
   throw Error('Incomplete legacy summary');
 const v=verdict(p.tasks,summary.results,tree);
 if(!v.success||v.planDigest!==p.planDigest)throw Error('Invalid legacy task evidence');
 return v;
}

const rawFromEnv=e=>'cpu_matrix='+e.QA_CPU_MATRIX+'\nbrowser_matrix='+e.QA_BROWSER_MATRIX+'\nexpected='+e.QA_EXPECTED+'\n';
const bool=s=>{if(s==='true')return true;if(s==='false')return false;throw Error('Invalid boolean output');};
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const mode=process.argv[2],e=process.env;
  if(mode==='plan'){
   const p=describePlan(rawFromEnv(e));
   const event=JSON.parse(readFileSync(e.GITHUB_EVENT_PATH,'utf8'));
   const policy=JSON.parse(readFileSync('scripts/ci-overhaul/delivery-policy.json','utf8'));
   const forceLegacy=e.GITHUB_EVENT_NAME==='pull_request'&&isApprovedBannersPullRequest(event,e.GITHUB_REPOSITORY);
   const route=selectDeliveryRoute({policy,request:e.PW_QA_ROUTE,eventName:e.GITHUB_EVENT_NAME,
    sameRepo:event.pull_request?.head?.repo?.full_name===e.GITHUB_REPOSITORY,count:p.count,forceLegacy});
   appendFileSync(e.GITHUB_OUTPUT,'route='+route+'\ncount='+p.count+'\nplan_digest='+p.planDigest+'\n');
   console.log(JSON.stringify({route,count:p.count,planDigest:p.planDigest}));
  }else if(mode==='legacy'){
   console.log(JSON.stringify(verifyLegacy(rawFromEnv(e),JSON.parse(readFileSync(process.argv[3],'utf8')),e.QA_TREE)));
  }else if(mode==='gate'){
   const r=assertDelivery({plan:e.QA_PLAN_RESULT,route:e.QA_ROUTE,count:Number(e.QA_COUNT),
    hasCpu:bool(e.QA_HAS_CPU),hasBrowser:bool(e.QA_HAS_BROWSER),legacyCpu:e.QA_CPU_RESULT,
    legacyBrowser:e.QA_BROWSER_RESULT,summary:e.QA_SUMMARY_RESULT,candidate:e.QA_CANDIDATE_RESULT});
   console.log(JSON.stringify(r));if(e.GITHUB_STEP_SUMMARY)appendFileSync(e.GITHUB_STEP_SUMMARY,'## Pocket Works CI Gate\nRoute: '+r.route+'; original app tasks: '+r.count+'; coverage: '+r.coverage+'\n');
  }else throw Error('Unknown delivery gate command');
 }catch(e){console.error(e);process.exitCode=1;}
}
