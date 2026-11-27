// Pilot only: actual omission of fresh CPU work, never an application production authorization.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,lstatSync,readdirSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonical,digest,taskDigest} from './verified-results.mjs';
import {approvedTask,scopeRoots,compareScope,normalizeSnapshot,summarizeResult} from './universal-cross-commit.mjs';
import {PAIRS,buildReceipt,verifyReceipt,validateRuntime,validateContext,gateSummary} from './universal-signed-receipts.mjs';
const REPO='JustSadSock/pocket-works',SOURCE_RUN=46020376393,SOURCE_CONTROLLER='f528f6387cb3470b22f9e190ca28014f770ec85c';
const flags={productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
const eq=(a,b)=>canonical(a)===canonical(b),fail=s=>{throw Error(s);};
const read=(p,max=4_000_000)=>{const s=lstatSync(p);if(!s.isFile()||s.size>max)fail('Invalid evidence file');return readFileSync(p);};
const json=p=>JSON.parse(read(p));
const put=(p,x)=>writeFileSync(p,JSON.stringify(x,null,2)+'\n',{flag:'wx'});
const git=(repo,args)=>execFileSync('git',args,{cwd:repo,maxBuffer:64*1024*1024}).toString().trim();
const gh=args=>execFileSync('gh',args,{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
const pairFor=app=>{const p=PAIRS.find(p=>p.app===app);if(!p)fail('Unapproved task');return p;};
export function sourceContext(run,repo){
 if(run?.id!==SOURCE_RUN||run.repository?.full_name!==REPO||run.head_repository?.full_name!==REPO||run.path!=='.github/workflows/universal-cross-commit-proof.yml'||run.head_branch!=='main'||run.head_sha!==SOURCE_CONTROLLER||run.status!=='completed'||run.conclusion!=='success'||run.event!=='push')fail('Wrong trusted issuer run');
 return validateContext({repository:REPO,workflow:run.path,controller:run.head_sha,controllerTree:git(repo,['rev-parse',run.head_sha+'^{tree}']),run:run.id,attempt:run.run_attempt,ref:'refs/heads/main',event:run.event},true);
}
function reconstructMount(repo,pair){
 const dir=mkdtempSync(join(tmpdir(),'pw-delivery-'));
 try{
  const a=execFileSync('git',['archive',pair.current,...scopeRoots(pair.app)],{cwd:repo,maxBuffer:70*1024*1024});
  execFileSync('tar',['-xf','-','-C',dir],{input:a});
  return normalizeSnapshot(repo,pair.current,pair.app,dir);
 }finally{rmSync(dir,{recursive:true,force:true});}
}
function authenticated(repo,root,now){
 const run=JSON.parse(gh(['api','repos/'+REPO+'/actions/runs/'+SOURCE_RUN])),ctx=sourceContext(run,repo);
 const receipts=join(root,'receipts'),raw=join(root,'raw');
 if(!eq(readdirSync(receipts).sort(),[...PAIRS.map(p=>p.app+'.json'),'summary.json'].sort()))fail('Incomplete signed subjects');
 if(!eq(readdirSync(raw).sort(),PAIRS.map(p=>'universal-cross-proof-'+ctx.attempt+'-'+p.app).sort()))fail('Incomplete source bundles');
 for(const n of readdirSync(receipts))gh(['attestation','verify',join(receipts,n),'--repo',REPO,'--cert-identity','https://github.com/'+REPO+'/'+ctx.workflow+'@refs/heads/main','--source-ref','refs/heads/main','--source-digest',ctx.controller,'--deny-self-hosted-runners']);
 const rows=PAIRS.map(p=>{const r=json(join(receipts,p.app+'.json'));verifyReceipt(r,buildReceipt(repo,ctx,p,join(raw,'universal-cross-proof-'+ctx.attempt+'-'+p.app),r.issuedAt),now);return r;});
 if(!eq(gateSummary(ctx,rows,now),json(join(receipts,'summary.json'))))fail('Invalid signed summary');
 const last=JSON.parse(gh(['api','repos/'+REPO+'/actions/runs/'+SOURCE_RUN]));if(!eq(sourceContext(last,repo),ctx))fail('Issuer attempt changed');
 return rows;
}
export function decide(pair,receipt,target,now){
 const fresh=reason=>({mode:'fresh',reason,...flags});
 if(pair.app==='press')return fresh('Mandatory fresh canary');
 if(!receipt)return fresh('Authenticated receipt unavailable');
 if(!pair.expected||!receipt.observedEquivalent)return fresh('Scoped inputs changed');
 if(receipt.pair?.app!==pair.app||!eq(receipt.pair,pair)||!eq(receipt.task,approvedTask(pair.app))||!Number.isSafeInteger(now)||now<receipt.issuedAt||now>=receipt.expiresAt)return fresh('Receipt identity or expiry mismatch');
 if(!eq(receipt.prior.mount,target.mount)||!eq(receipt.current.mount,target.mount)||!eq(receipt.prior.runtime,target.runtime)||!eq(receipt.current.runtime,target.runtime))return fresh('Actual target mount or runtime changed');
 if(!eq(receipt.scope,target.scope)||target.scope.scopeMatch!==true||target.scope.distinctCommits!==true||target.scope.distinctTrees!==true)return fresh('Actual commit scope differs');
 return {mode:'verified-pilot',reason:'Authenticated equivalent cross-commit inputs',receiptDigest:digest(canonical(receipt)),sourceRun:receipt.issuer.run,sourceAttempt:receipt.issuer.attempt,tests:receipt.prior.result.counts.tests,...flags};
}
function actualContext(repo){
 const c={repository:process.env.GITHUB_REPOSITORY,run:Number(process.env.GITHUB_RUN_ID),attempt:Number(process.env.GITHUB_RUN_ATTEMPT),controller:git(repo,['rev-parse','HEAD']),tree:git(repo,['rev-parse','HEAD^{tree}'])};
 if(c.repository!==REPO||c.controller!==process.env.GITHUB_SHA||!Number.isSafeInteger(c.run)||c.run<=0||!Number.isSafeInteger(c.attempt)||c.attempt<=0)fail('Invalid actual delivery identity');return c;
}
function targetProof(repo,pair,dir,ctx){
 const scope=compareScope(repo,pair.prior,pair.current,pair.app),mount=reconstructMount(repo,pair),runtime=validateRuntime(json(join(dir,'runtime.json')));
 for(const n of ['before','inside','after'])if(!eq(mount,json(join(dir,n+'.json'))))fail('Actual mount mismatch: '+n);
 const target={context:ctx,task:approvedTask(pair.app),scope,mount,runtime};
 if(!eq(target,json(join(dir,'target.json'))))fail('Target proof differs');
 return target;
}
function inspect(repo,pair,dir,ctx,receipt,now){
 const target=targetProof(repo,pair,dir,ctx),decision=json(join(dir,'decision.json')),expected=decide(pair,receipt,target,now);
 const hit=decision.mode==='verified-pilot';
 if(hit&&!eq(decision,expected))fail('Unverified cross-commit hit');
 if(!hit&&(decision.mode!=='fresh'||Object.keys(flags).some(k=>decision[k]!==false)))fail('Invalid fallback decision');
 const files=['runtime.json','before.json','inside.json','after.json','target.json','decision.json'];
 let tests;
 if(hit){tests=decision.tests;if(existsSync(join(dir,'result.json'))||existsSync(join(dir,'console.log')))fail('Ambiguous hit evidence');}
 else{files.push('result.json','console.log');tests=summarizeResult(target.task,json(join(dir,'result.json')),read(join(dir,'console.log'),2_100_000).toString('utf8')).counts.tests;}
 if(!eq(readdirSync(dir).sort(),files.sort()))fail('Unexpected target evidence');
 return {app:pair.app,task:target.task.key,mode:decision.mode,tests,reason:decision.reason,receiptDigest:hit?decision.receiptDigest:null};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,app,dir,source]=process.argv.slice(2),repo=process.cwd(),ctx=actualContext(repo),now=Date.now();
  if(mode==='source-attempt'){const run=JSON.parse(gh(['api','repos/'+REPO+'/actions/runs/'+SOURCE_RUN]));console.log(sourceContext(run,repo).attempt);}
  else if(mode==='prepare'){
   const pair=pairFor(app),target={context:ctx,task:approvedTask(app),scope:compareScope(repo,pair.prior,pair.current,app),mount:json(join(dir,'before.json')),runtime:validateRuntime(json(join(dir,'runtime.json')))};
   if(!eq(target.mount,reconstructMount(repo,pair))||!eq(target.mount,json(join(dir,'inside.json'))))fail('Invalid target preparation');
   put(join(dir,'target.json'),target);
   let receipt;try{receipt=authenticated(repo,source,now).find(r=>r.pair.app===app);}catch(e){console.log('Fresh fallback: '+e.message.slice(0,200));}
   put(join(dir,'decision.json'),decide(pair,receipt,target,now));
  }else if(mode==='gate'){
   let receipts=[];try{receipts=authenticated(repo,source,now);}catch(e){console.log('Source unavailable: '+e.message.slice(0,200));}
   if(!eq(readdirSync(dir).sort(),PAIRS.map(p=>'cross-delivery-'+ctx.attempt+'-'+p.app).sort()))fail('Missing or unexpected delivery artifact');
   const rows=PAIRS.map(p=>inspect(repo,p,join(dir,'cross-delivery-'+ctx.attempt+'-'+p.app),ctx,receipts.find(r=>r.pair.app===p.app),now));
   if(rows.find(r=>r.app==='press').mode!=='fresh'||rows.find(r=>r.app==='flickyard').mode!=='fresh')fail('Fresh control not executed');
   console.log(JSON.stringify({schema:1,context:ctx,expected:3,passed:3,success:true,authenticatedSubjects:receipts.length?4:0,reusedTasks:rows.filter(r=>r.mode==='verified-pilot').length,freshTasks:rows.filter(r=>r.mode==='fresh').length,rows,...flags},null,2));
  }else fail('Unknown delivery operation');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
