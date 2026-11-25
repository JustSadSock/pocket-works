import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { integratedPlan,firstPass,finish,readAttempt } from './integrated.mjs';
const tasks=['a','b','c'].map(app=>({key:app+'-visual',app,suite:'visual',kind:'visual',seed:null,install:false}));
const raw='cpu_matrix={"include":[]}\nbrowser_matrix='+JSON.stringify({include:tasks})+'\nexpected='+JSON.stringify(tasks.map(t=>t.key));
const ok=t=>({schema:1,...t,success:true,exitCode:0,signal:null,timedOut:false});
const legacy={schema:1,expected:3,passed:3,failed:0,missing:[],success:true,results:tasks.map(ok)};
function fixture(fn){
 const root=mkdtempSync(join(tmpdir(),'pw-integrated-'));
 try{
  for(const t of tasks){const dir=join(root,'apps',t.app);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'app.config.json'),JSON.stringify({runtime:t.app==='a'?'quick':'enhanced'}));}
  const plan=integratedPlan(raw,root),first=join(root,'first'),retry=join(root,'retry');mkdirSync(first);mkdirSync(retry);
  const add=(folder,prefix,s,t,r)=>{
   const dir=join(folder,prefix+s.id,t.key);mkdirSync(dir,{recursive:true});
   writeFileSync(join(dir,'result.json'),JSON.stringify(r));
   writeFileSync(join(dir,'executor-timing.json'),JSON.stringify({schema:1,key:t.key,pool:s.pool,success:r.success,totalMs:10,phases:{checkout:2,legacyExecution:8}}));
  };
  for(const s of plan.shards)for(const t of s.tasks)add(first,'shadow-shard-',s,t,{...ok(t),success:t.app!=='b',...(t.app!=='a'?{buildMode:'same-run-prebuilt'}:{})});
  fn({root,plan,first,retry,add});
 }finally{rmSync(root,{recursive:true,force:true});}
}
test('integrated plan separates quick from shared build tasks and retries only failures',()=>fixture(({plan,first,retry,add})=>{
 assert.deepEqual(plan.prebuilt,['b-visual','c-visual']);assert.equal(plan.hasBuild,true);
 const p=firstPass(plan,legacy,first);assert.equal(p.prior.batchedPassed,2);assert.equal(p.selection.shards.length,1);assert.equal(p.selection.shards[0].needsBuild,true);
 const s=p.selection.shards[0],t=s.tasks[0];add(retry,'retry-shard-',s,t,{...ok(t),buildMode:'same-run-prebuilt'});
 const r=finish(plan,legacy,first,retry);assert.equal(r.finalPassed,3);assert.equal(r.recovered,1);assert.equal(r.migrationReady,false);assert.equal(r.telemetry.browser.attempts,4);
}));
test('missing first evidence or build mode is fatal, not a retry candidate',()=>fixture(({plan,first,add})=>{
 const s=plan.shards.find(s=>s.tasks.some(t=>t.app==='c')),t=s.tasks.find(t=>t.app==='c');
 add(first,'shadow-shard-',s,t,ok(t));
 assert.throws(()=>firstPass(plan,legacy,first),/Required build reuse/);
 rmSync(join(first,'shadow-shard-'+s.id,t.key),{recursive:true});
 assert.throws(()=>firstPass(plan,legacy,first),/Missing attempt tasks/);
}));
test('retry budget and missing retry evidence fail closed',()=>fixture(({plan,first,retry})=>{
 assert.throws(()=>firstPass(plan,legacy,first,{retryLimit:0}),/Retry budget/);
 assert.throws(()=>finish(plan,legacy,first,retry),/Missing attempt artifacts/);
}));
