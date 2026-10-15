import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advanceDays,audit,serialize,deserialize,BASE_TUNING,normalizeTuning,storageCapacity} from './model.js';
import {diagnoseWorld,summarizeDiagnostics,comparePaired} from './laboratory.js';

const create=(tuning={})=>createWorld(413,{scenario:'normal',tuning});

test('default tuning is neutral and supported by legacy saves',()=>{
 const s=create();assert.deepEqual(s.tuning,BASE_TUNING);
 const old=JSON.parse(serialize(s));delete old.tuning;
 const restored=deserialize(JSON.stringify(old));assert.deepEqual(restored.tuning,BASE_TUNING);
 advanceDays(s,12);advanceDays(restored,12);
 assert.deepEqual(JSON.parse(serialize(restored)),JSON.parse(serialize(s)));
});
test('parameter normalization rejects nonnumeric and out-of-range inputs',()=>{
 for(const input of [{yield:0},{storage:3},{weather:Infinity},{transport:'1'},{planting:NaN}])assert.throws(()=>normalizeTuning(input));
 assert.equal(normalizeTuning({yield:.85}).yield,.85);
});
test('storage multiplier changes physical capacity and preservation',()=>{
 const ordinary=create(),reduced=create({storage:.75});
 assert.equal(storageCapacity(reduced.households[0],reduced),storageCapacity(ordinary.households[0],ordinary)*.75);
 advanceDays(ordinary,20);advanceDays(reduced,20);
 assert.ok(reduced.stats.spoiled>ordinary.stats.spoiled);
 assert.ok(audit(ordinary).ok&&audit(reduced).ok);
});
test('yield multiplier changes harvest, without creating ledger imbalances',()=>{
 const baseline=create(),low=create({yield:.85});
 advanceDays(baseline,300);advanceDays(low,300);
 assert.ok(baseline.stats.harvest>low.stats.harvest);
 assert.ok(audit(baseline).ok&&audit(low).ok);
});
test('planting multiplier changes sown area under matched conditions',()=>{
 const base=create(),high=create({planting:1.2});
 advanceDays(base,110);advanceDays(high,110);
 const a=base.households.reduce((sum,h)=>sum+(h.farmYear?.plannedArea||0),0);
 const b=high.households.reduce((sum,h)=>sum+(h.farmYear?.plannedArea||0),0);
 assert.ok(b>a,`planted ${b} > ${a}`);
 assert.ok(audit(high).ok);
});
test('weather multiplier changes forcing without changing initial world',()=>{
 const base=create(),high=create({weather:1.5});
 assert.deepEqual(base.terrain,high.terrain);
 advanceDays(base,1);advanceDays(high,1);
 assert.notEqual(base.weather,high.weather);
});
test('profiler never affects determinism or simulation content',()=>{
 const base=create(),observed=create(),profile={};
 advanceDays(base,130);advanceDays(observed,130,profile);
 assert.equal(serialize(base),serialize(observed));
 assert.ok(profile.households>0&&profile.demography>=0&&profile.marketsAndAid>=0);
});
test('diagnostics are read-only and have interpretable distributions',()=>{
 const s=create(),before=serialize(s);
 const d=diagnoseWorld(s);
 assert.equal(d.population,s.people.filter(p=>p.alive).length);
 assert.ok(d.foodDaysMedian>0);
 assert.equal(d.homes,s.households.length);
 assert.equal(d.communities.reduce((n,c)=>n+c.people,0),d.population);
 assert.ok(d.grainGini>=0&&d.grainGini<=1);
 assert.ok(d.coinGini>=0&&d.coinGini<=1);
 assert.ok(d.foodDaysP10<=d.foodDaysMedian&&d.foodDaysMedian<=d.foodDaysP90);
 assert.equal(serialize(s),before);
 assert.equal(summarizeDiagnostics(d).households,undefined);
 assert.equal(comparePaired(d,d).population,0);
});
test('diagnostics identify a family with no grain, without awarding it free resources',()=>{
 const s=create(),h=s.households[0],old={grain:h.grain,oats:h.oats,pulses:h.pulses,garden:h.garden,dairy:h.dairy};
 for(const good of Object.keys(old))h[good]=0;
 const d=diagnoseWorld(s);assert.ok(d.familiesUnder30Days>=1);
 assert.equal(d.households.find(x=>x.id===h.id).foodDays,0);
 assert.equal(h.grain,0);
 Object.assign(h,old);assert.ok(audit(s).ok);
});
test('tuned world survives save/load and produces identical daily outcomes',()=>{
 const a=create({yield:.85,weather:1.5,storage:.75});advanceDays(a,90);
 const b=deserialize(serialize(a));advanceDays(a,60);advanceDays(b,60);
 assert.equal(serialize(a),serialize(b));assert.ok(audit(a).ok);
});
test('transport multiplier changes actual payments, preserving total coins',()=>{
 const a=create(),b=create({transport:1.5});
 advanceDays(a,350);advanceDays(b,350);
 assert.notEqual(a.households[0].coin,b.households[0].coin);
 assert.ok(audit(a).ok&&audit(b).ok);
});