// Practical rollback drill, isolated on the experimental branch.
// This never changes a production workflow, branch rule, or deployment.
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,renameSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {ROOT} from '../universal-qa/plan.mjs';
import {selectPilot,compareEvidence} from './pilot.mjs';
import {command,executeShard} from './run-shard.mjs';
import {canonical,digest,taskDigest} from './verified-results.mjs';
import {canaryOutcome} from './migration-gate.mjs';

const out=resolve(process.argv[3]),shard=selectPilot(readFileSync(process.argv[2],'utf8'));
const tasks=shard.tasks,git=(...args)=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8'}).trim();
const tree=git('rev-parse','HEAD^{tree}'),planDigest=digest(canonical(tasks.map(taskDigest).sort()));
const artifacts=join(ROOT,'qa-artifacts');
if(existsSync(artifacts)||existsSync(out))throw Error('Drill requires clean output');
mkdirSync(out,{recursive:true});
const write=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2));
const readResults=folder=>Object.fromEntries(tasks.map(t=>[t.key,JSON.parse(readFileSync(join(folder,t.key,'result.json'),'utf8'))]));
function report(records,executionSucceeded){
 const passed=tasks.filter(t=>compareEvidence([t],{[t.key]:records[t.key]},{[t.key]:records[t.key]}).success);
 return {tree,planDigest,expected:tasks.length,finalPassed:passed.length,
  passedTaskDigests:passed.map(taskDigest),success:executionSucceeded&&passed.length===tasks.length};
}
// Force a real executor failure without modifying any app/test code.
const fault=await command(process.execPath,['scripts/ci-overhaul/run-shard.mjs'],{
 cwd:ROOT,env:{...process.env,PW_QA_SHARD:JSON.stringify({...shard,id:'invalid-injected-shard'})},timeoutMs:30000
});
if(fault.success||existsSync(artifacts))throw Error('Injected new executor failure not isolated');
const before=canaryOutcome({});
if(before.route!=='legacy-full'||before.deliveryAllowed)throw Error('Unsafe fallback route');
// Independent legacy route, direct original runner, one clean checkout per task.
const fallbackDir=join(out,'legacy');mkdirSync(fallbackDir);
let originalSucceeded=true;
for(const t of tasks){
 const temp=mkdtempSync(join(tmpdir(),'rollback-legacy-')),work=join(temp,'checkout');
 try{
  git('worktree','add','--detach',work,'HEAD');
  const run=await command(process.execPath,['scripts/universal-qa/run.mjs'],{
   cwd:work,env:{...process.env,PW_QA_TASK:JSON.stringify(t)},timeoutMs:2700000
  });
  originalSucceeded&&=run.success;
  renameSync(join(work,'qa-artifacts',t.key),join(fallbackDir,t.key));
 }finally{
  if(existsSync(work))git('worktree','remove','--force',work);
  rmSync(temp,{recursive:true,force:true});
 }
}
const legacy=report(readResults(fallbackDir),originalSucceeded);
const fallback=canaryOutcome({legacy});
if(!legacy.success||!fallback.deliveryAllowed||fallback.canaryPassed||!fallback.rollback)throw Error('Real legacy fallback failed');
const actual=await executeShard(ROOT,shard);
const integratedDir=join(out,'integrated');renameSync(artifacts,integratedDir);
const integrated=report(readResults(integratedDir),actual.success);
const restored=canaryOutcome({legacy,integrated});
if(!restored.canaryPassed||!restored.deliveryAllowed||restored.rollback)throw Error('Recovery path failed');
// A separate invalid legacy invocation demonstrates that a failed/missing
// original verdict never becomes a green delivery through the new verdict.
const broken=await command(process.execPath,['scripts/universal-qa/run.mjs'],{
 cwd:ROOT,env:{...process.env,PW_QA_TASK:'invalid-json-injected'},timeoutMs:30000
});
if(broken.success)throw Error('Legacy fault unexpectedly passed');
const blocked=canaryOutcome({legacy:{...legacy,success:false},integrated});
if(blocked.deliveryAllowed||blocked.canaryPassed||!blocked.rollback)throw Error('Failed original verdict bypassed');
const result={schema:1,scope:'Two real dependency-free CPU tasks; local experimental routing only',tree,taskKeys:tasks.map(t=>t.key),
 injectedNewExitCode:fault.code,legacy,integrated,legacyFallback:fallback,recoveredCanary:restored,
 injectedLegacyExitCode:broken.code,blockedDelivery:blocked,success:true,productionChanged:false};
write(join(out,'report.json'),result);console.log(JSON.stringify(result,null,2));
