import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {suite,trial} from './breaking-lab.mjs';
test('specialized pressure, reserve, rotation and objective laboratory',{timeout:180000},()=>{
 const rows=suite();assert.equal(rows.length,50);for(const run of rows){assert.ok(run.timeline.length>0);let last=0;for(const m of run.timeline){assert.ok(m.time>=last&&m.time<=run.objective.seconds);last=m.time;assert.ok(m.power.every(Number.isFinite));assert.ok(m.area.every(n=>n>=0));for(const s of m.sides){for(const [key,v] of Object.entries(s))if(v!==null)assert.ok(Number.isFinite(v)&&v>=-1e-8,key)}}}
 const archived=JSON.parse(readFileSync(new URL('./breaking-results.json',import.meta.url),'utf8'));assert.equal(archived.runs.length,50);assert.deepEqual(trial('relief','Ash Hollow',1),trial('relief','Ash Hollow',1));
 console.log(JSON.stringify(rows.map(r=>({name:r.name,seed:r.seed,variant:r.variant,objective:r.objective,last:r.timeline.at(-1)})),null,2));
});
