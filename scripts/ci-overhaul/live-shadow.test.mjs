import test from 'node:test';
import assert from 'node:assert/strict';
import {planShards} from './sharding.mjs';
import {selectLiveRetry,completeLive,livePlan} from './live-shadow.mjs';
const tree='a'.repeat(40),tasks=['a','b'].map(app=>({key:app+'-test',app,suite:'test',kind:'node-test',seed:null,install:false}));
const plan={tasks,shards:planShards(tasks),prebuilt:[]};
const ok=t=>({schema:1,...t,success:true,exitCode:0,signal:null,timedOut:false});
test('live shadow keeps full coverage and only retries failed tasks',()=>{
 const first=[ok(tasks[0]),{...ok(tasks[1]),success:false}];
 const s=selectLiveRetry(plan,first,tree);
 assert.equal(s.shards.length,1);assert.equal(s.shards[0].tasks[0].key,tasks[1].key);
 const result=completeLive(plan,first,[ok(tasks[1])],tree);
 assert.equal(result.finalPassed,2);assert.equal(result.firstPass,1);assert.equal(result.recovered,1);
 assert.equal(result.productionAuthorization,false);assert.equal(result.legacyRequired,true);
 assert.throws(()=>completeLive(plan,first,[],tree),/retry coverage/);
});
test('missing evidence, mismatched task or retry budget block candidate',()=>{
 assert.throws(()=>selectLiveRetry(plan,[ok(tasks[0])],tree),/Incomplete/);
 assert.throws(()=>selectLiveRetry(plan,[ok(tasks[0]),{...ok(tasks[1]),seed:2}],tree),/identity/);
 assert.throws(()=>selectLiveRetry(plan,[ok(tasks[0]),{...ok(tasks[1]),success:false}],tree,0),/budget/);
});

import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const empty='cpu_matrix={"include":[]}\nbrowser_matrix={"include":[]}\nexpected=[]\n';
test('infrastructure-only empty legacy plan exercises real representative smoke, never a zero-task success',()=>{
 const root=mkdtempSync(join(tmpdir(),'pw-live-plan-'));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 try{
  for(const [app,runtime,suite] of [
   ['axis-pals','quick',{id:'rules',kind:'node-test',files:['rules.test.mjs']}],
   ['crumple-yard','enhanced',{id:'visual',kind:'visual'}]
  ]){
   const dir=join(root,'apps',app);mkdirSync(dir,{recursive:true});
   writeFileSync(join(dir,'app.config.json'),JSON.stringify({runtime}));
   writeFileSync(join(dir,'qa.plan.json'),JSON.stringify({schema:1,suites:[suite]}));
   if(suite.files)writeFileSync(join(dir,suite.files[0]),'');
  }
  git('init','-q');git('add','.');git('-c','user.name=QA','-c','user.email=qa@example.invalid','commit','-qm','base');
  const base=git('rev-parse','HEAD');
  writeFileSync(join(root,'README.md'),'infra');git('add','.');git('-c','user.name=QA','-c','user.email=qa@example.invalid','commit','-qm','infra');
  const head=git('rev-parse','HEAD');
  const p=livePlan(empty,root,{eventName:'pull_request',base,head});
  assert.equal(p.coverageScope,'infrastructure-smoke');assert.equal(p.originalLegacyJobs,0);
  assert.equal(p.tasks.length,2);assert.equal(p.hasBuild,true);assert.equal(p.hasCpu,true);assert.equal(p.hasBrowser,true);
  assert.equal(completeLive(p,p.tasks.map(t=>({...ok(t),...(p.prebuilt.includes(t.key)?{buildMode:'same-run-prebuilt'}:{})})),[],tree).coverageScope,'infrastructure-smoke');
  assert.throws(()=>livePlan(empty,root,{eventName:'workflow_dispatch'}),/cannot be replaced/);
  assert.throws(()=>livePlan(empty.replace('expected=[]','expected=["missing"]'),root,{eventName:'pull_request',base,head}),/mismatch/);
  writeFileSync(join(root,'apps','axis-pals','rules.test.mjs'),'// change');git('add','.');git('-c','user.name=QA','-c','user.email=qa@example.invalid','commit','-qm','app');
  assert.throws(()=>livePlan(empty,root,{eventName:'pull_request',base,head:git('rev-parse','HEAD')}),/cannot be replaced/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
