// Crown balance shard 3: signed gameplay projection with explicit measurement separation.
// This is a source receipt, never permission to substitute historical timing for fresh QA.
import {readFileSync,writeFileSync,readdirSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {canonical,digest} from './verified-results.mjs';
import {CASES,auditHeavyPair} from './heavy-cross-commit.mjs';
const flags={productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
const SHA=/^[0-9a-f]{40}$/,HEX=/^[0-9a-f]{64}$/,AGE=7*86400000;
const eq=(a,b)=>canonical(a)===canonical(b),pos=n=>Number.isSafeInteger(n)&&n>0,fail=s=>{throw Error(s);};
const read=(p,max=128*1024*1024)=>{const s=lstatSync(p);if(!s.isFile()||s.size>max)fail('Unsafe Crown source evidence');return readFileSync(p);};
const json=p=>JSON.parse(read(p,4_000_000));
export function validateCrownContext(ctx,mainOnly=false){
 if(ctx?.repository!=='JustSadSock/pocket-works'||ctx.workflow!=='.github/workflows/crown-signed-simulation.yml'||!SHA.test(ctx.controller)||!SHA.test(ctx.controllerTree)||!pos(ctx.run)||!pos(ctx.attempt)||!((ctx.ref==='refs/heads/main'&&['push','workflow_dispatch'].includes(ctx.event))||(!mainOnly&&ctx.event==='pull_request'&&/^refs\/pull\/\d+\/merge$/.test(ctx.ref))))fail('Invalid Crown issuer context');
 return ctx;
}
export function performanceCoverage(receipt,fresh){
 // The original long-running shard interleaves measurements with gameplay. A
 // bounded microbenchmark or old samples cannot replace the complete coverage.
 if(receipt?.measurementPolicy!=='original-1638-fresh-per-target-v1')return {decision:'execute-original',reason:'Unknown measurement policy',...flags};
 if(!fresh||fresh.kind!=='original-fresh-simulation'||fresh.measurements!==1638||fresh.source!==receipt.scope.current||fresh.run===receipt.issuer.run&&fresh.attempt===receipt.issuer.attempt||!pos(fresh.run)||!pos(fresh.attempt)||!HEX.test(fresh.measurementDigest??''))return {decision:'execute-original',reason:'Missing independent complete fresh measurement coverage',...flags};
 return {decision:'execute-original',reason:'Original execution already supplies complete fresh measurements; no independent cheaper performance phase qualified',...flags};
}
function bundle(root,ctx,side){
 const d=join(root,'heavy-'+ctx.attempt+'-crown-'+side),key=CASES.crown.task.key,output=join(d,'output',key);
 const inputs=['identity.json','before.json','inside.json','after.json','runtime.json','timing.json'];
 const reports=['balance-3.json','balance-8.json','balance-targeted-3.json','discovery-3.json','society-3.json','society-300-4-legacy-audit.json','console.log','result.json'];
 if(!lstatSync(d).isDirectory()||!lstatSync(join(d,'output')).isDirectory()||!lstatSync(output).isDirectory()||!eq(readdirSync(d).sort(),[...inputs,'output'].sort())||!eq(readdirSync(join(d,'output')),[key])||!eq(readdirSync(output).sort(),reports.sort()))fail('Incomplete Crown original bundle');
 return {files:Object.fromEntries([...inputs.map(n=>[n,digest(read(join(d,n)))]),...reports.map(n=>['output/'+key+'/'+n,digest(read(join(output,n)))])]),runtime:json(join(d,'runtime.json')),mount:json(join(d,'before.json'))};
}
export function buildCrownReceipt(repo,root,ctx,issuedAt){
 validateCrownContext(ctx);
 if(!pos(issuedAt)||!eq(readdirSync(root).sort(),['current','prior'].map(s=>'heavy-'+ctx.attempt+'-crown-'+s).sort()))fail('Incomplete Crown pair');
 const proof=auditHeavyPair(repo,'crown',root,{run:ctx.run,attempt:ctx.attempt,controller:ctx.controller});
 if(!proof.mountMatch||!proof.controlled||!proof.semanticMatch||!proof.negativeControl||proof.scenarios!==18||!eq(proof.measurementCounts,[1638,1638]))fail('Crown qualification incomplete');
 return {schema:1,kind:'crown-balance-source-receipt-v1',issuer:ctx,task:CASES.crown.task,scope:proof.scope,prior:bundle(root,ctx,'prior'),current:bundle(root,ctx,'current'),semanticDigests:proof.semanticDigests,rawDigests:proof.rawDigests,runtimeDrift:proof.runtimeDrift,scenarios:18,measurementsPerExecution:1638,durationMs:proof.durationMs,measurementPolicy:'original-1638-fresh-per-target-v1',issuedAt,expiresAt:issuedAt+AGE,...flags};
}
export function verifyCrownReceipt(r,reconstructed,now){
 if(!pos(now)||!pos(r?.issuedAt)||now<r.issuedAt||r.expiresAt!==r.issuedAt+AGE||now>=r.expiresAt||!eq(r,reconstructed))fail('Changed, expired or unrelated Crown receipt');
 return {schema:1,success:true,scenarios:36,measurements:3276,receiptDigest:digest(canonical(r)),performance:performanceCoverage(r,null),...flags};
}
function context(){
 const e=process.env,git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim();
 const c=validateCrownContext({repository:e.GITHUB_REPOSITORY,workflow:'.github/workflows/crown-signed-simulation.yml',controller:git('rev-parse','HEAD'),controllerTree:git('rev-parse','HEAD^{tree}'),run:Number(e.GITHUB_RUN_ID),attempt:Number(e.GITHUB_RUN_ATTEMPT),event:e.GITHUB_EVENT_NAME,ref:e.GITHUB_REF});
 if(c.controller!==e.GITHUB_SHA)fail('Wrong issuer checkout');return c;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,root,file]=process.argv.slice(2),ctx=context(),now=Date.now();
  if(mode==='issue'){const r=buildCrownReceipt(process.cwd(),root,ctx,now);writeFileSync(file,JSON.stringify(r,null,2)+'\n',{flag:'wx'});}
  else if(mode==='gate'){const r=json(file),v=verifyCrownReceipt(r,buildCrownReceipt(process.cwd(),root,ctx,r.issuedAt),now);console.log(JSON.stringify(v,null,2));}
  else fail('Unknown operation');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
