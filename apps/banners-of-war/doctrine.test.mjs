import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {doctrines,cases,suite,summarize} from './doctrine-lab.mjs';
test('doctrine matrix: matched conditions, complete metrics, mirrored outcomes and failure cases',{timeout:180000},()=>{
 const rows=suite(),saved=JSON.parse(readFileSync(new URL('./doctrine-results.json',import.meta.url),'utf8'));
 assert.equal(rows.length,doctrines.length*cases.length*2);
 assert.equal(rows.length,saved.runs.length);
 for(const row of rows){
  assert.deepEqual(row.control.initial,row.tactical.initial);
  for(const run of [row.control,row.tactical]){assert.ok(run.time>0&&run.time<=120);assert.ok(Number.isFinite(run.score));for(const side of [run.own,run.enemy])for(const [key,value] of Object.entries(side)){assert.ok(Number.isFinite(value),key);assert.ok(value>=-1e-8,key);}}
  const prior=saved.runs.find(x=>x.id===row.id&&x.seed===row.seed&&x.style===row.style&&x.mirror===row.mirror);
  assert.ok(prior);assert.ok(Math.abs(prior.delta-row.delta)<.001,row.id+'/'+row.seed+'/'+row.style);
  const mirrored=rows.find(x=>x.id===row.id&&x.seed===row.seed&&x.style===row.style&&x.mirror!==row.mirror);
  assert.ok(mirrored);assert.ok(Math.abs(mirrored.delta-row.delta)<.001,row.id+'/'+row.seed+' mirror');
 }
 const summary=summarize(rows);console.log(JSON.stringify(summary,null,2));for(const d of summary){assert.ok(d.positive>0,d.id+' has no beneficial trial');assert.ok(d.negative>0,d.id+' has no failure trial');}
});
