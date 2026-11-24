import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {doctrines,cases,landscapeCases,suite,landscapeSuite,summarize} from './doctrine-lab.mjs';
const file=name=>JSON.parse(readFileSync(new URL(name,import.meta.url),'utf8'));
function validate(rows,saved,count){assert.equal(rows.length,count);assert.equal(rows.length,saved.runs.length);for(const row of rows){assert.deepEqual(row.control.initial,row.tactical.initial);for(const run of [row.control,row.tactical]){assert.ok(run.time>0&&run.time<=120);assert.ok(Number.isFinite(run.score));for(const side of [run.own,run.enemy])for(const [key,value] of Object.entries(side)){assert.ok(Number.isFinite(value),key);assert.ok(value>=-1e-8,key);}}
 const prior=saved.runs.find(x=>x.id===row.id&&x.seed===row.seed&&x.style===row.style&&x.mirror===row.mirror);assert.ok(prior);assert.ok(Math.abs(prior.delta-row.delta)<.001,row.id+'/'+row.seed+'/'+row.style+' reproduction');
 const mirrored=rows.find(x=>x.id===row.id&&x.seed===row.seed&&x.style===row.style&&x.mirror!==row.mirror);assert.ok(mirrored);assert.ok(Math.abs(mirrored.delta-row.delta)<.001,row.id+'/'+row.seed+' mirror');
 }console.log(JSON.stringify(summarize(rows),null,2))}
test('preserve original 0.2.1 experiment evidence and complete paired matrix',{timeout:300000},()=>{let archived=file('./doctrine-results-0.2.1.json');assert.equal(archived.runs.length,260);for(const q of archived.summary){assert.ok(q.positive>0);assert.ok(q.negative>0)}validate(suite(),file('./doctrine-results.json'),doctrines.length*cases.length*2)});
test('all ten doctrines on four new landscapes: metrics, matched conditions, reproduction and mirrors',{timeout:180000},()=>validate(landscapeSuite(),file('./living-doctrine-results.json'),doctrines.length*landscapeCases.length*2));
// Relative doctrine effectiveness is an observation, not an acceptance threshold. Physical and deterministic regressions remain mandatory.
