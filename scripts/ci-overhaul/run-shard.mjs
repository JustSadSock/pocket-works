// Experimental executor. Every task runs the unchanged legacy executor in a
// fresh worktree. Build reuse is opt-in and restricted to verified same-run artifacts.
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, resolveTasks } from '../universal-qa/plan.mjs';
import { identity as buildIdentity, stageBuild, prebuiltRunnerSource } from './build-once.mjs';

const identity = t => JSON.stringify(Object.keys(t).sort().map(k=>[k,t[k]]));
const poolFor = t => ['visual','playwright','browser-node'].includes(t.kind) ? 'browser' :
  t.install ? 'cpu-install' : 'cpu-plain';

export function validateShard(root, shard) {
  if (!shard || !['browser','cpu-install','cpu-plain'].includes(shard.pool) ||
      !Array.isArray(shard.tasks) || !shard.tasks.length || shard.tasks.length>8 ||
      !new RegExp('^'+shard.pool+'-[0-9]{3,}$').test(shard.id)) throw Error('Invalid shard');
  const seen = new Set();
  for (const t of shard.tasks) {
    if (!t || !/^[a-z0-9-]+$/.test(t.key) || seen.has(t.key) || poolFor(t)!==shard.pool)
      throw Error('Invalid, duplicate, or mixed-pool task');
    seen.add(t.key);
    const allowed = resolveTasks(root,{apps:[t.app],suite:t.suite,profile:'deep'})
      .find(x=>x.key===t.key);
    if(!allowed || identity(allowed)!==identity(t)) throw Error('Task differs from legacy manifest: '+t.key);
  }
}

export function command(binary,args,{cwd,env=process.env,timeoutMs}) {
  return new Promise(done=>{
    const child=spawn(binary,args,{cwd,env,stdio:'inherit',shell:false,detached:true});
    let expired=false,spawnError=null;
    const killGroup=()=>{if(child.pid)try{process.kill(-child.pid,'SIGKILL')}catch(e){if(e.code!=='ESRCH')throw e;}};
    const timer=setTimeout(()=>{expired=true;killGroup();},timeoutMs);
    child.on('error',e=>{spawnError=e;});
    child.on('close',(code,signal)=>{
      clearTimeout(timer);
      // A task must not leave a dev server or browser process behind.
      killGroup();
      done({success:code===0&&!expired&&!spawnError&&!signal,code,signal,expired,error:spawnError?.message});
    });
  });
}

export async function executeShard(root,shard,{buildBundle=null}={}) {
  if(process.platform!=='linux') throw Error('Pilot executor requires Linux process-group isolation');
  validateShard(root,shard);
  const artifacts=join(root,'qa-artifacts');
  for(const t of shard.tasks) if(existsSync(join(artifacts,t.key))) throw Error('Stale output: '+t.key);
  mkdirSync(artifacts,{recursive:true});
  const results=[];
  for(const task of shard.tasks) {
    const temp=mkdtempSync(join(tmpdir(),'pw-qa-'));
    const work=join(temp,'checkout');
    const dest=join(artifacts,task.key);
    mkdirSync(dest,{recursive:true});
    let failure=null, run=null, cleanup=null;
    const startedAt=new Date().toISOString();
    const taskStart=performance.now(), phases={};
    let phase='checkout', phaseStart=taskStart;
    const next=name=>{phases[phase]=Math.round(performance.now()-phaseStart);phase=name;phaseStart=performance.now();};
    try {
      const checkout=await command('git',['worktree','add','--detach',work,'HEAD'],{cwd:root,timeoutMs:120000});
      if(!checkout.success) throw Error('Isolated checkout failed: '+JSON.stringify(checkout));
      next('install');
      if(shard.pool!=='cpu-plain') {
        const install=await command('npm',['ci','--legacy-peer-deps','--no-audit','--no-fund'],{cwd:work,timeoutMs:600000});
        if(!install.success) throw Error('Dependency installation failed: '+JSON.stringify(install));
        if(shard.pool==='browser'){
          const browser=await command(process.execPath,['-e',"if(require('@playwright/test/package.json').version!=='1.55.0')process.exit(1)"],{cwd:work,timeoutMs:30000});
          if(!browser.success) throw Error('Playwright version mismatch');
        }
      }
      next('stageBuild');
      let runner='scripts/universal-qa/run.mjs', verified=false;
      if(buildBundle&&shard.pool==='browser'){
        const config=JSON.parse(readFileSync(join(work,'apps',task.app,'app.config.json'),'utf8'));
        if(config.runtime!=='quick'){
          await stageBuild(resolve(buildBundle),work,buildIdentity(work));
          runner='scripts/universal-qa/run-build-once.mjs';
          writeFileSync(join(work,runner),prebuiltRunnerSource(readFileSync(join(work,'scripts/universal-qa/run.mjs'),'utf8')),{flag:'wx'});
          verified=true;
        }
      }
      next('legacyExecution');
      run=await command(process.execPath,[runner],{
        cwd:work,timeoutMs:2700000,env:{...process.env,PW_QA_TASK:JSON.stringify(task),PW_QA_VERIFIED_BUILD:verified?'1':'0'}
      });
      next('collectEvidence');
      const evidence=join(work,'qa-artifacts',task.key);
      if(existsSync(evidence)) cpSync(evidence,dest,{recursive:true});
      if(!run.success) throw Error('Legacy runner failed: '+JSON.stringify(run));
      const report=JSON.parse(readFileSync(join(dest,'result.json'),'utf8'));
      const reportedTask=Object.fromEntries(Object.keys(task).map(k=>[k,report[k]]));
      if(report.schema!==1 || report.success!==true || identity(reportedTask)!==identity(task) || (verified&&report.buildMode!=='same-run-prebuilt'))
        throw Error('Missing, mismatched or failed legacy evidence');
    } catch(e) { failure=e.message; }
    finally {
      next('cleanup');
      if(existsSync(work)) {
        cleanup=await command('git',['worktree','remove','--force',work],{cwd:root,timeoutMs:120000});
        if(!cleanup.success) failure=(failure?failure+'; ':'')+'Worktree cleanup failed';
      }
      rmSync(temp,{recursive:true,force:true});
    }
    if(failure) {
      const resultFile=join(dest,'result.json');
      if(existsSync(resultFile)) cpSync(resultFile,join(dest,'legacy-result.json'));
      writeFileSync(resultFile,JSON.stringify({schema:1,...task,success:false,startedAt,finishedAt:new Date().toISOString(),error:failure},null,2));
    }
    next('done');
    const telemetry={schema:1,key:task.key,pool:shard.pool,success:!failure,totalMs:Math.round(performance.now()-taskStart),phases};
    writeFileSync(join(dest,'executor-timing.json'),JSON.stringify(telemetry,null,2),{flag:'wx'});
    results.push({key:task.key,success:!failure,error:failure});
    console.log((failure?'FAIL ':'PASS ')+task.key+(failure?': '+failure:''));
  }
  return {schema:1,shard:shard.id,results,success:results.length===shard.tasks.length&&results.every(t=>t.success)};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {
    const report=await executeShard(ROOT,JSON.parse(process.env.PW_QA_SHARD||''),{buildBundle:process.env.PW_QA_BUILD_BUNDLE||null});
    console.log(JSON.stringify(report));
    if(!report.success)process.exitCode=1;
  }catch(e){console.error(e);process.exitCode=1;}
}
