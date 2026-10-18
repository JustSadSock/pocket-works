import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advanceDays,serialize,audit} from './model.js';
import {snapshotReality,validateObservation,summarizeEnsemble,AGE_BANDS} from './qa/realism-metrics.mjs';
import {renderRealismReport} from './qa/realism-report.mjs';

const cloned=o=>JSON.parse(JSON.stringify(o));
test('research observer is read-only at founding and labels incomplete historical evidence',()=>{
 const s=createWorld(413),saved=serialize(s),snap=snapshotReality(s,null);
 assert.equal(serialize(s),saved);
 assert.equal(snap.observation.year,0);
 assert.equal(snap.observation.population,s.people.filter(p=>p.alive).length);
 assert.equal(snap.observation.observability.historicalStatus,'illustrative-not-validated');
 assert.ok(snap.observation.historicalComparison.every(c=>
  ['insufficient-sample','illustrative-comparison'].includes(c.interpretation)));
 assert.ok(snap.observation.historicalComparison.some(c=>c.sampleSize<20));
 assert.deepEqual(validateObservation(snap.observation),[]);
 assert.deepEqual(Object.keys(snap.observation.ageCounts),AGE_BANDS);
});

test('annual demographic observations reconcile actual deaths, rights and food',()=>{
 const s=createWorld(7777);
 const origin=snapshotReality(s,null);
 advanceDays(s,365);
 const result=audit(s);assert.ok(result.ok,result.issues.slice(0,6).join('; '));
 const row=snapshotReality(s,origin.next).observation;
 assert.equal(row.year,1);
 assert.ok(row.population>=0);
 assert.ok(row.vital.births>=0&&row.vital.deaths>=0);
 assert.equal(Object.values(row.vital.newlyDeadAgeCounts).reduce((a,b)=>a+b,0),row.vital.deaths);
 assert.ok(row.food.insufficientDailyRationHomes<=row.households);
 assert.ok(row.householdsEconomy.giniLand>=0&&row.householdsEconomy.giniLand<=1);
 assert.deepEqual(validateObservation(row),[]);
});

test('independent ensemble summaries do not count years as extra sample worlds',()=>{
 const s=createWorld(413),snap=snapshotReality(s,null).observation;
 const a=cloned(snap),b=cloned(snap),d=cloned(snap);
 a.year=1;b.year=2;d.year=2;
 b.food.harvestedGrainKg=100;d.food.harvestedGrainKg=70;
 const runs=[
  {seed:413,scenario:'normal',years:2,annual:[a,b],validation:{materialAudit:true}},
  {seed:413,scenario:'drought',years:2,annual:[a,d],validation:{materialAudit:true}}
 ];
 const summary=summarizeEnsemble(runs);
 assert.equal(summary.runs,2);
 assert.equal(summary.groups.length,2);
 assert.equal(summary.groups[0].sampleWorlds,1);
 assert.equal(summary.pairedCounterfactuals.length,1);
 assert.equal(summary.pairedCounterfactuals[0].harvestKgDelta,-30);
 assert.equal(summary.historicalEvidence,'unvalidated; ancient records are not sampled from the simulated population');
 assert.throws(()=>summarizeEnsemble([...runs,runs[0]]),/Duplicate/);
 assert.throws(()=>summarizeEnsemble([{...runs[0],validation:{materialAudit:false}}]),/Incomplete/);
 const markdown=renderRealismReport({generatedAt:'2026-10-18',summary,runs});
 assert.match(markdown,/историческая достоверность не подтверждена/i);
 assert.match(markdown,/Сценарий \/ лет/);
 assert.match(markdown,/−?30|\-30/); // Difference is printed from the actual two archived harvests
});

test('invalid statistics fail technical QA without claiming to fail history',()=>{
 const row=snapshotReality(createWorld(413),null).observation;
 const damaged=cloned(row);damaged.ageCounts.under1+=1;
 assert.ok(validateObservation(damaged).includes('demographic-reconciliation'));
 damaged.ageCounts.under1-=1;damaged.food.grainKg=-4;
 assert.ok(validateObservation(damaged).includes('negative-world-grain'));
 const fake=cloned(row);fake.historicalComparison[0].interpretation='historically-validated';
 assert.ok(validateObservation(fake).includes('fabricated-historical-validation'));
});
