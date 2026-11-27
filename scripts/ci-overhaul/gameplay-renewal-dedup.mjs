// Deduplicate only scheduled issuance; never grant a gameplay admission.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {discover} from './gameplay-receipt-discovery.mjs';
import {REPO,APP_PR} from './gameplay-renewal.mjs';
import {PLAN} from './verified-gameplay-receipt.mjs';
const SHA=/^[a-f0-9]{40}$/,DAY=86400000,MAX_AGE=7*DAY,MIN_REMAINING=2*DAY;
const flags={productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
export function renewalDecision(identity,controller,report,now=Date.now()){
 const result=(required,reason)=>({schema:1,renewalRequired:required,reason,source:identity?.source??null,sourceTree:identity?.sourceTree??null,controller:controller?.sha??null,controllerTree:controller?.tree??null,...flags});
 if(!Number.isSafeInteger(now)||now<=0||!SHA.test(identity?.source??'')||!SHA.test(identity?.sourceTree??'')||identity.sourcePR!==APP_PR||!['main','refs/pull/'+APP_PR+'/merge'].includes(identity.sourceRef)||!SHA.test(controller?.sha??'')||!SHA.test(controller?.tree??''))return result(true,'Invalid renewal identity');
 if(report?.schema!==1||report.status!=='authenticated-candidate'||report.authenticatedSubjects!==9||report.verifiedBundles!==8||report.shards!==8||report.source!==identity.source||report.sourceTree!==identity.sourceTree||report.issuer!==controller.sha||report.issuerTree!==controller.tree||report.checkout!==controller.sha||report.planDigest!==PLAN||report.compatibility!=='pinned-runtime-gameplay-v1'||!Number.isSafeInteger(report.sourceRun)||report.sourceRun<=0||!Number.isSafeInteger(report.sourceAttempt)||report.sourceAttempt<=0||Object.keys(flags).some(k=>report[k]!==false))return result(true,'No exact authenticated catalog');
 // Preserve a two-day renewal buffer before the original expiry. No timestamps
 // or signatures are extended; discovery skips non-issuing scheduled runs.
 if(!Number.isSafeInteger(report.expiresAt)||report.expiresAt-now<MIN_REMAINING||report.expiresAt-now>MAX_AGE)return result(true,'Catalog requires refresh');
 return {...result(false,'Recent exact catalog already authenticated'),existingRun:report.sourceRun,existingAttempt:report.sourceAttempt,expiresAt:report.expiresAt};
}
export function checkRenewal(identity,controller,out,{lookup=discover,clock=Date.now}={}){
 let report;
 try{report=lookup(identity.source,controller.sha,out,{requiredIssuer:controller.sha});}catch(e){console.log('Catalog lookup failed: '+String(e.message).slice(0,150));}
 const decision=renewalDecision(identity,controller,report,clock());
 // Observational counters never participate in the authorization decision.
 const stats=report?.lookupStats;
 if(stats&&['listed','issuerExcluded','metadataChecks','withoutCatalog','candidateDownloads'].every(k=>Number.isSafeInteger(stats[k])&&stats[k]>=0))return {...decision,lookupStats:Object.fromEntries(['listed','issuerExcluded','metadataChecks','withoutCatalog','candidateDownloads'].map(k=>[k,stats[k]]))};
 return decision;
}
const git=args=>execFileSync('git',args,{encoding:'utf8'}).trim();
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [identityFile,output]=process.argv.slice(2),identity=JSON.parse(readFileSync(identityFile,'utf8')),controller={sha:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}'])};
  if(process.env.GITHUB_REPOSITORY!==REPO||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_EVENT_NAME!=='schedule'||process.env.GITHUB_SHA!==controller.sha)throw Error('Deduplication is only available for trusted scheduled renewal');
  mkdirSync(output,{recursive:false});
  const result=checkRenewal(identity,controller,output);
  writeFileSync(join(output,'renewal-decision.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(result,null,2));
 }catch(e){console.error(e.message);process.exitCode=1;}
}
