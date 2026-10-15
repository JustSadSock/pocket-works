import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advanceDays,audit,serialize,deserialize,storageCapacity} from './model.js';
import {REFERENCES,REFERENCE_POINTS,historicalObservation,historicalComparison,quantiles,summarizeHistoricalRuns} from './historical-calibration.js';
const check=s=>assert.ok(audit(s).ok,audit(s).issues.slice(0,7).join(' | '));
test('archive references explicitly distinguish reconstructed England from four simulated villages',()=>{
 assert.equal(REFERENCE_POINTS.femaleFirstMarriage.value,24);
 assert.equal(REFERENCE_POINTS.maleFirstMarriage.value,27);
 assert.equal(REFERENCE_POINTS.householdSize.value,5.8);
 assert.equal(REFERENCE_POINTS.customaryTenementsAbove10Acres.value,.861);
 assert.match(REFERENCES.tenure.scope,/NOT all English farms/);
 assert.ok(Object.values(REFERENCES).every(r=>r.uri.startsWith('https://')));
});
test('foundation land is stratified within historical sample and stores are preexisting finite inventories',()=>{
 const s=createWorld(413);
 assert.equal(s.historicalProfile.version,2);
 const sample=s.households.filter(h=>h.tenure==='customary'&&h.tenureOrigin==='initial-settlement');
 assert.equal(sample.length,16);
 assert.equal(sample.filter(h=>h.fields.length*.0625/.40468564224>10).length,12);
 assert.ok(s.households.every(h=>storageCapacity(h,s)>=1050&&h.foundingStoreKg>=0));
 const firstTotals=s.households.reduce((n,h)=>n+h.grain+h.oats+h.pulses,0);
 assert.ok(firstTotals>0);
 advanceDays(s,365*2);
 check(s);
});
test('observations are read-only and missing samples are not mistaken for passing benchmarks',()=>{
 const s=createWorld(7777),raw=serialize(s),initial=historicalObservation(s);
 assert.equal(serialize(s),raw);
 assert.equal(initial.firstMarriagesObserved,0);
 assert.equal(historicalComparison(initial).find(r=>r.metric==='femaleFirstMarriage').interpretation,'insufficient-sample');
 assert.equal(initial.customaryTenementsAbove10Acres,.75);
 assert.equal(initial.activeVillages,4);
 assert.equal(serialize(s),raw);
});
test('published reference values are retained separately from observed outcomes',()=>{
 const s=createWorld(43821);
 advanceDays(s,365*10);
 const report=historicalObservation(s),comparison=historicalComparison(report);
 assert.equal(comparison.length,4);
 assert.equal(comparison.find(r=>r.metric==='householdSize').reference,5.8);
 assert.ok(report.householdSize>0);
 assert.ok(report.femaleFirstMarriage===null||report.femaleFirstMarriage>=21);
 check(s);
});
test('cohort ranges describe model variation rather than invented historical certainty',()=>{
 assert.deepEqual(quantiles([2,6,10,14]),{n:4,p10:3.2,median:8,p90:12.8,mean:8,min:2,max:14});
 assert.equal(quantiles([]).median,null);
 const a=historicalObservation(createWorld(413)),b=historicalObservation(createWorld(7777));
 const summary=summarizeHistoricalRuns([a,b]);
 assert.equal(summary.runs,2);
 assert.equal(summary.statistics.population.n,2);
 assert.match(summary.limits,/not historical confidence intervals/);
});
test('v0.6 save remains byte-identical and does not acquire free founding stores or land',()=>{
 const s=createWorld(43821);
 for(const h of s.households)delete h.foundingStoreKg;
 s.historicalProfile.version=1;
 const raw=serialize(s),copy=deserialize(raw);
 assert.equal(serialize(copy),raw);
 assert.ok(copy.households.every(h=>h.foundingStoreKg===undefined));
 advanceDays(copy,365);
 check(copy);
});
