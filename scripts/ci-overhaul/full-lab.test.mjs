import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fullPlan,audit } from './full-lab.mjs';
const tasks=Array.from({length:180},(_,i)=>({key:'app-suite-'+i,app:'app',suite:'suite',kind:i%3?'node-test':'visual',seed:null,install:false}));
const raw='cpu_matrix='+JSON.stringify({include:tasks.filter(t=>t.kind==='node-test')})+'\nbrowser_matrix='+JSON.stringify({include:tasks.filter(t=>t.kind==='visual')})+'\nexpected='+JSON.stringify(tasks.map(t=>t.key));
const plan=fullPlan(raw);
const results=tasks.map(t=>({schema:1,...t,success:true,exitCode:0,signal:null,timedOut:false}));
const legacy={schema:1,expected:180,passed:180,failed:0,missing:[],success:true,results};
test('full executable plan preserves every legacy task within runner capacity',()=>{
  assert.equal(plan.legacyJobs,180);
  assert.ok(plan.shards.every(s=>s.tasks.length<=6));
  assert.ok(plan.shardJobs<180);
});
test('full audit rejects missing evidence, unknown artifacts, duplicate legacy evidence and failures',()=>{
  const dir=mkdtempSync(join(tmpdir(),'pw-full-audit-'));
  try{
    for(const shard of plan.shards){
      for(const task of shard.tasks){
        const folder=join(dir,'shadow-shard-'+shard.id,task.key);
        mkdirSync(folder,{recursive:true});
        writeFileSync(join(folder,'result.json'),JSON.stringify(results.find(r=>r.key===task.key)));
      }
    }
    assert.equal(audit(plan,legacy,dir).success,true);
    assert.equal(audit(plan,{...legacy,results:[...results,results[0]]},dir).success,false);
    assert.equal(audit(plan,{...legacy,success:false},dir).success,false);
    const s=plan.shards[0],t=s.tasks[0],file=join(dir,'shadow-shard-'+s.id,t.key,'result.json');
    writeFileSync(file,JSON.stringify({...results.find(r=>r.key===t.key),timedOut:true}));
    assert.equal(audit(plan,legacy,dir).success,false);
    writeFileSync(file,JSON.stringify(results.find(r=>r.key===t.key)));
    mkdirSync(join(dir,'shadow-shard-unknown'));
    assert.equal(audit(plan,legacy,dir).success,false);
    rmSync(join(dir,'shadow-shard-unknown'),{recursive:true});
    rmSync(file);
    assert.equal(audit(plan,legacy,dir).success,false);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
