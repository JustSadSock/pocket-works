import test from 'node:test';
import assert from 'node:assert/strict';
import { planShards, assertParity, shadowFromLegacy } from './sharding.mjs';

const fixture = Array.from({length:256},(_,i)=>({
  key:'app-suite-'+i,app:'app',suite:'suite',
  kind:['node-test','node','visual','playwright'][i%4],seed:i,install:i%3===0
}));
const legacy = (tasks) => {
  const cpu = tasks.filter(t=>['node','node-test'].includes(t.kind));
  const browser = tasks.filter(t=>!cpu.includes(t));
  return 'cpu_matrix='+JSON.stringify({include:cpu})+'\nbrowser_matrix='+JSON.stringify({include:browser})+'\nexpected='+JSON.stringify(tasks.map(t=>t.key));
};
test('256 tasks retain exact identity, deterministic order, and correct pools',()=>{
  const shards=planShards(fixture);
  assert.equal(shards.length,49);
  assert.equal(assertParity(fixture,shards),true);
  assert.deepEqual(shards,planShards([...fixture].reverse()));
  for(const s of shards){
    assert.ok(s.tasks.length<=8);
    assert.ok(s.tasks.every(t=>s.pool==='browser'?['visual','playwright','browser-node'].includes(t.kind):
      ['node','node-test'].includes(t.kind)&&t.install===(s.pool==='cpu-install')));
    assert.ok(s.estimatedMs<=900000||s.tasks.length===1);
  }
});
test('rejects missing, duplicate and altered tasks',()=>{
  const shards=planShards(fixture);
  assert.throws(()=>assertParity(fixture,shards.slice(1)),/Missing/);
  assert.throws(()=>assertParity(fixture,[...shards,shards[0]]),/Unexpected/);
  const modified=structuredClone(shards);
  modified[0].tasks[0].seed=-1;
  assert.throws(()=>assertParity(fixture,modified),/altered/);
  assert.throws(()=>planShards([...fixture,fixture[0]]),/duplicate/);
});
test('unknown kinds and unsafe identifiers fail closed',()=>{
  assert.throws(()=>planShards([{...fixture[0],kind:'unknown'}]),/Unknown/);
  assert.throws(()=>planShards([{...fixture[0],key:'../escape'}]),/Invalid/);
});
test('history adjusts durations, invalid history falls back, long tasks remain alone',()=>{
  const tasks=fixture.slice(0,4);
  const history={[tasks[0].key]:2000000,[tasks[1].key]:-1};
  const shards=planShards(tasks,{history,targetMs:100000});
  assert.equal(shards.find(s=>s.tasks.includes(tasks[0])).estimatedMs,2000000);
  assert.equal(shards.find(s=>s.tasks.includes(tasks[1])).estimatedMs,180000);
  assert.ok(shards.every(s=>s.tasks.length===1));
});
test('empty plan is valid and capacity limits do not discard tasks',()=>{
  assert.deepEqual(planShards([]),[]);
  assert.equal(planShards(fixture,{maxTasks:1}).length,256);
  assert.throws(()=>planShards(fixture,{maxTasks:0}),/Invalid/);
});
test('shadow input checks expected keys and legacy partition',()=>{
  const raw=legacy(fixture);
  const shadow=shadowFromLegacy(raw);
  assert.equal(shadow.legacyJobs,256);
  assert.equal(shadow.shardJobs,49);
  assert.equal(assertParity(fixture,shadow.shards),true);
  assert.throws(()=>shadowFromLegacy(raw.replace(/expected=.*/,'expected=[]')),/mismatch/);
  assert.throws(()=>shadowFromLegacy(raw+'\nexpected=[]'),/Duplicate/);
  assert.throws(()=>shadowFromLegacy(raw.split('\n')[0]),/Incomplete/);
});
