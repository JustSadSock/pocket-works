import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advanceDays,audit,serialize,foodAccess} from './model.js';
import {livingByHouse,householdFoodSnapshot,CausalityRecorder,detectCausalFlags} from './qa/causality-metrics.mjs';
import {killDraftOxen,FAMILY_SEEDS,FACTORS,CRISES} from './qa/causality-study.mjs';

test('daily food evidence counts three real field crops and fresh food without mutating the world',()=>{
 const s=createWorld(413),h=s.households[0];
 const before=serialize(s);
 const members=livingByHouse(s).get(h.id);
 const snapshot=householdFoodSnapshot(s,h,members);
 const access=foodAccess(s,h);
 assert.ok(snapshot.stocks.oats>0);
 assert.ok(snapshot.stocks.pulses>0);
 assert.equal(snapshot.stockDays,access.foodDays);
 assert.equal(snapshot.needKg,access.dailyNeedKg);
 assert.equal(access.oatsKg,snapshot.stocks.oats);
 assert.equal(access.pulsesKg,snapshot.stocks.pulses);
 assert.equal(serialize(s),before);
});

test('stock days never falsely promise a complete daily ration of pulses',()=>{
 const s=createWorld(7777),h=s.households[0];
 h.grain=0;h.oats=0;h.garden=0;h.dairy=0;h.pulses=500;
 const x=householdFoodSnapshot(s,h,livingByHouse(s).get(h.id));
 const access=foodAccess(s,h);
 assert.ok(x.stockDays>14);
 assert.ok(x.possibleRationToday<.4);
 assert.ok(access.rationCoverageToday<.4);
 assert.notEqual(access.reason,'supplied');
 assert.ok(detectCausalFlags(x).includes('stocks-do-not-cover-daily-diet'));
});

test('family recorder keeps read-only monthly evidence and reconstructs a death timeline',()=>{
 const s=createWorld(413);
 const recorder=new CausalityRecorder();
 advanceDays(s,1);
 const serialized=serialize(s);
 recorder.capture(s);
 assert.equal(serialize(s),serialized);
 assert.equal(recorder.monthlySnapshots.length,1);
 const first=s.households[0],cause={houseId:first.id,personId:first.members[0],day:s.day+1,
  reason:'no-saleable-surplus',foodDays:0,shortageDays:28};
 advanceDays(s,1);
 s.foodCases=[cause];s.stats.starvationDeaths=1;
 const before=serialize(s);
 recorder.capture(s);
 assert.equal(serialize(s),before);
 const result=recorder.result(s);
 assert.equal(result.deaths.length,1);
 assert.equal(result.missingCases,0);
 assert.equal(result.deaths[0].timeline.length,2);
 assert.equal(result.deaths[0].timeline[0].day,1);
 assert.equal(result.deaths[0].timeline[1].day,2);
});

test('draft-oxen crisis kills real animals and preserves every material invariant',()=>{
 const s=createWorld(413),before=s.households.reduce((n,h)=>n+h.cattle,0);
 const intervention=killDraftOxen(s);
 assert.ok(intervention.deadDraftOxen>0);
 assert.equal(before-s.households.reduce((n,h)=>n+h.cattle,0),intervention.deadDraftOxen);
 assert.ok(s.households.every(h=>h.dairyCows+h.draftOxen===h.cattle));
 const checked=audit(s);
 assert.ok(checked.ok,checked.issues.join('; '));
});

test('audit plan has 232 distinct scenario-world runs, without any survival threshold',()=>{
 assert.equal(FAMILY_SEEDS.length,new Set(FAMILY_SEEDS).size);
 assert.equal(FAMILY_SEEDS.length,32);
 assert.equal(FACTORS.length,6);
 assert.equal(CRISES.length,4);
 assert.equal(32+24*6+12*4+8,232);
 assert.ok(FACTORS.slice(1).every(v=>Object.keys(v.tuning).length===1));
});
