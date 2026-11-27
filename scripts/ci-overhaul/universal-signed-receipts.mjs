// Independent receipt reconstruction; no production authorization.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,lstatSync,readdirSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonical,digest,taskDigest} from './verified-results.mjs';
import {approvedTask,scopeRoots,compareScope,normalizeSnapshot,summarizeResult,compareExecution} from './universal-cross-commit.mjs';
const SHA=/^[0-9a-f]{40}$/,HEX=/^[0-9a-f]{64}$/,AGE=7*86400000;
const REPO='JustSadSock/pocket-works',WORKFLOW='.github/workflows/universal-cross-commit-proof.yml';
const flags={productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
const fail=s=>{throw Error(s);},eq=(a,b)=>canonical(a)===canonical(b),pos=n=>Number.isSafeInteger(n)&&n>0;
export const PAIRS=Object.freeze([
 Object.freeze({app:'axis-pals',prior:'91019b3bea4a37a51cd223f84aad997fa3a9eee9',current:'5c87f6448f2ec8a5eab0f9d1921651334d510e16',expected:true}),
 Object.freeze({app:'press',prior:'91019b3bea4a37a51cd223f84aad997fa3a9eee9',current:'5c87f6448f2ec8a5eab0f9d1921651334d510e16',expected:true}),
 Object.freeze({app:'flickyard',prior:'5c87f6448f2ec8a5eab0f9d1921651334d510e16',current:'a00c4525d4b7714fdecea09602eb841753bb326c',expected:false})
]);
const git=(repo,args)=>execFileSync('git',args,{cwd:repo,maxBuffer:64*1024*1024}).toString().trim();
const read=(p,max=4_000_000)=>{const s=lstatSync(p);if(!s.isFile()||s.size>max)fail('Invalid evidence file');return readFileSync(p);};
const json=p=>JSON.parse(read(p));
const put=(p,x)=>writeFileSync(p,JSON.stringify(x,null,2)+'\n',{flag:'wx'});
const dirs=(p,names)=>{if(!lstatSync(p).isDirectory()||!eq(readdirSync(p).sort(),[...names].sort()))fail('Unexpected or missing evidence: '+p);};
export function validateRuntime(r){
 if(!r||!eq(Object.keys(r).sort(),['image','config','node','arch','toolchain','kernel','cpu','uid','gid'].sort())||
 r.image!=='node@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb'||!/^sha256:[0-9a-f]{64}$/.test(r.config)||
 !/^v22\.\d+\.\d+$/.test(r.node)||r.arch!=='x64'||!['toolchain','kernel','cpu'].every(k=>HEX.test(r[k]))||
 !pos(r.uid)||!pos(r.gid))fail('Invalid pinned runtime');
 return r;
}
export function validateContext(c,protectedMain=false){
 if(!c||c.repository!==REPO||c.workflow!==WORKFLOW||!SHA.test(c.controller)||!SHA.test(c.controllerTree)||!pos(c.run)||!pos(c.attempt)||
 !((c.ref==='refs/heads/main'&&['push','workflow_dispatch'].includes(c.event))||(!protectedMain&&c.event==='pull_request'&&/^refs\/pull\/\d+\/merge$/.test(c.ref))))fail('Untrusted receipt context');
 return c;
}
function reconstructMount(repo,sha,app){
 const dir=mkdtempSync(join(tmpdir(),'pw-independent-mount-'));
 try{
  const archive=execFileSync('git',['archive',sha,...scopeRoots(app)],{cwd:repo,maxBuffer:70*1024*1024});
  execFileSync('tar',['-xf','-','-C',dir],{input:archive});
  return normalizeSnapshot(repo,sha,app,dir);
 }finally{rmSync(dir,{recursive:true,force:true});}
}
export function buildReceipt(repo,ctx,pair,root,issuedAt){
 validateContext(ctx);
 if(!pos(issuedAt)||!PAIRS.some(p=>eq(p,pair))||git(repo,['rev-parse',ctx.controller+'^{tree}'])!==ctx.controllerTree)fail('Invalid issuer or pair');
 git(repo,['merge-base','--is-ancestor',pair.prior,pair.current]);
 const task=approvedTask(pair.app),scope=compareScope(repo,pair.prior,pair.current,pair.app);
 if(!eq(scope,json(join(root,'scope.json')))||scope.scopeMatch!==pair.expected)fail('Independent scope differs');
 const runtime=validateRuntime(json(join(root,'runtime.json'))),sides={};
 const names=['scope.json','runtime.json','report.json'];
 for(const side of ['prior','current']){
  const key=task.key,dir=join(root,side+'-output',key),raw=read(join(dir,'result.json')),log=read(join(dir,'console.log'),2_100_000);
  dirs(join(root,side+'-output'),[key]);dirs(dir,['result.json','console.log']);
  const mount=reconstructMount(repo,pair[side],pair.app);
  for(const stage of ['before','inside','after']){const name=side+'-'+stage+'.json';names.push(name);if(!eq(mount,json(join(root,name))))fail('Independent mount differs: '+name);}
  const result=summarizeResult(task,JSON.parse(raw),log.toString('utf8'));
  if(!eq(result,json(join(root,side+'-result.json')))||!eq({mount,runtime,result},json(join(root,side+'.json'))))fail('Independent raw result differs');
  sides[side]={mount,runtime,result,resultDigest:digest(raw),logDigest:digest(log)};
  names.push(side+'-result.json',side+'.json',side+'-output');
 }
 dirs(root,names);
 const report=compareExecution(scope,sides.prior,sides.current);
 if(!eq(report,json(join(root,'report.json')))||report.observedEquivalent!==pair.expected||!report.runtimeMatch||!report.assertionMatch)fail('Independent pair report differs');
 return {schema:1,kind:'universal-cross-commit-receipt-v1',issuer:ctx,pair,task,taskDigest:taskDigest(task),scope,prior:sides.prior,current:sides.current,observedEquivalent:report.observedEquivalent,issuedAt,expiresAt:issuedAt+AGE,...flags};
}
export function verifyReceipt(r,reconstructed,now){
 if(!pos(now)||!pos(r?.issuedAt)||now<r.issuedAt||now>=r.expiresAt||r.expiresAt!==r.issuedAt+AGE||!eq(r,reconstructed))fail('Receipt expired, altered, or unrelated');
 return r.observedEquivalent===true;
}
export function gateSummary(ctx,receipts,now){
 validateContext(ctx);
 if(!Array.isArray(receipts)||receipts.length!==PAIRS.length)fail('Incomplete receipt matrix');
 const rows=PAIRS.map(pair=>{
  const matches=receipts.filter(r=>r?.pair?.app===pair.app);
  if(matches.length!==1)fail('Missing or duplicate task');
  const r=matches[0];if(!eq(r.pair,pair)||!eq(r.issuer,ctx)||r.kind!=='universal-cross-commit-receipt-v1'||r.schema!==1||!eq(r.task,approvedTask(pair.app))||r.taskDigest!==taskDigest(r.task)||r.observedEquivalent!==pair.expected||Object.keys(flags).some(k=>r[k]!==false)||!pos(now)||!pos(r.issuedAt)||now<r.issuedAt||r.expiresAt!==r.issuedAt+AGE||now>=r.expiresAt)fail('Unexpected task receipt');
  return {task:r.task.key,observedEquivalent:r.observedEquivalent,decision:'execute',receiptDigest:digest(canonical(r)),priorTests:r.prior.result.counts.tests,currentTests:r.current.result.counts.tests};
 });
 return {schema:1,mode:'independent-cross-commit-shadow-gate',issuer:ctx,expected:PAIRS.length,passed:rows.length,success:true,eligibleCandidates:rows.filter(r=>r.observedEquivalent).length,freshTasks:rows.length,reusedTasks:0,rows,...flags};
}
function context(repo){
 const c=validateContext({repository:process.env.GITHUB_REPOSITORY,workflow:WORKFLOW,controller:git(repo,['rev-parse','HEAD']),controllerTree:git(repo,['rev-parse','HEAD^{tree}']),run:Number(process.env.GITHUB_RUN_ID),attempt:Number(process.env.GITHUB_RUN_ATTEMPT),ref:process.env.GITHUB_REF,event:process.env.GITHUB_EVENT_NAME});
 if(c.controller!==process.env.GITHUB_SHA)fail('Wrong controller checkout');return c;
}
function artifactDir(root,ctx,pair){return join(root,'universal-cross-proof-'+ctx.attempt+'-'+pair.app);}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,raw,out]=process.argv.slice(2),repo=process.cwd(),ctx=context(repo),now=Date.now();
  dirs(raw,PAIRS.map(p=>'universal-cross-proof-'+ctx.attempt+'-'+p.app));
  if(mode==='issue'){
   mkdirSync(out);
   const receipts=PAIRS.map(pair=>{const r=buildReceipt(repo,ctx,pair,artifactDir(raw,ctx,pair),now);put(join(out,pair.app+'.json'),r);return r;});
   put(join(out,'summary.json'),gateSummary(ctx,receipts,now));
  }else if(mode==='gate'){
   dirs(out,[...PAIRS.map(p=>p.app+'.json'),'summary.json']);
   const receipts=PAIRS.map(pair=>{const r=json(join(out,pair.app+'.json'));verifyReceipt(r,buildReceipt(repo,ctx,pair,artifactDir(raw,ctx,pair),r.issuedAt),now);return r;});
   const report=gateSummary(ctx,receipts,now);
   if(!eq(report,json(join(out,'summary.json'))))fail('Independent gate report differs');
   console.log(JSON.stringify(report,null,2));
  }else fail('Unknown receipt mode');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
