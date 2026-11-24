import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTasks } from '../universal-qa/plan.mjs';
import { executeShard, validateShard, command } from './run-shard.mjs';
import { planShards } from './sharding.mjs';

test('isolated shard runs later tasks after failure and preserves all evidence',{skip:process.platform!=='linux'},async()=>{
  const root=mkdtempSync(join(tmpdir(),'pw-shard-test-'));
  const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'pipe'});
  try{
    mkdirSync(join(root,'apps','sample'),{recursive:true});
    mkdirSync(join(root,'scripts','universal-qa'),{recursive:true});
    writeFileSync(join(root,'apps','sample','app.config.json'),'{}');
    writeFileSync(join(root,'apps','sample','check.mjs'),'');
    writeFileSync(join(root,'apps','sample','qa.plan.json'),JSON.stringify({schema:1,suites:[{id:'trial',kind:'node',entry:'check.mjs',seeds:[1,2]}]}));
    writeFileSync(join(root,'scripts','universal-qa','run.mjs'),`
      import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
      import {join} from 'node:path';
      const t=JSON.parse(process.env.PW_QA_TASK);
      const contaminated=existsSync('contamination');
      writeFileSync('contamination','must not survive');
      const dest=join('qa-artifacts',t.key);
      mkdirSync(dest,{recursive:true});
      const success=t.seed===2&&!contaminated;
      writeFileSync(join(dest,'result.json'),JSON.stringify({schema:1,...t,success}));
      writeFileSync(join(dest,'console.log'),'raw evidence');
      if(!success)process.exitCode=1;
    `);
    git('init','-q');git('add','.');git('-c','user.name=QA','-c','user.email=qa@example.invalid','commit','-qm','fixture');
    const tasks=resolveTasks(root,{apps:['sample']});
    const shard=planShards(tasks)[0];
    assert.equal(shard.tasks.length,2);
    const altered=structuredClone(shard);
    altered.tasks[0].seed=999;
    assert.throws(()=>validateShard(root,altered),/differs/);
    const report=await executeShard(root,shard);
    assert.equal(report.success,false);
    assert.deepEqual(report.results.map(t=>t.success),[false,true]);
    for(const t of tasks)assert.ok(existsSync(join(root,'qa-artifacts',t.key,'console.log')));
    assert.equal(JSON.parse(readFileSync(join(root,'qa-artifacts',tasks[0].key,'result.json'),'utf8')).success,false);
    assert.ok(existsSync(join(root,'qa-artifacts',tasks[0].key,'legacy-result.json')));
    assert.equal(JSON.parse(readFileSync(join(root,'qa-artifacts',tasks[1].key,'result.json'),'utf8')).success,true);
    assert.equal(existsSync(join(root,'contamination')),false);
    assert.equal(git('worktree','list','--porcelain').toString().split('worktree ').length-1,1);
    await assert.rejects(()=>executeShard(root,shard),/Stale output/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('subprocess timeout is a failure',{skip:process.platform!=='linux'},async()=>{
  const r=await command(process.execPath,['-e','setInterval(()=>{},1000)'],{cwd:process.cwd(),timeoutMs:200});
  assert.equal(r.success,false);
  assert.equal(r.expired,true);
});
