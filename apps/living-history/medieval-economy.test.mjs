import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advanceDays,audit,overview,serialize,deserialize,CROP_KINDS} from './model.js';

const check=s=>assert.ok(audit(s).ok,audit(s).issues.slice(0,8).join('; '));
const totals=(s,k)=>+s.households.reduce((n,h)=>n+(h[k]||0),0).toFixed(2);

test('three crops are actual seed stocks, not newly granted calories',()=>{
 const s=createWorld(413);
 assert.equal(Object.keys(CROP_KINDS).length,3);
 assert.ok(totals(s,'grain')>0&&totals(s,'oats')>0&&totals(s,'pulses')>0);
 const opening=s.economy.grainInitial+s.economy.oatsInitial+s.economy.pulsesInitial;
 const physical=totals(s,'grain')+totals(s,'oats')+totals(s,'pulses');
 assert.ok(Math.abs(opening-physical)<.1);
 assert.ok(s.households.every(h=>h.cattle===h.dairyCows+h.draftOxen));
 check(s);
});
test('different crops consume their own seeds and produce their own audited harvests',()=>{
 const s=createWorld(413);advanceDays(s,365);
 assert.ok(s.stats.oatsSeeded>0&&s.stats.pulsesSeeded>0,'real oat/legume seed was spent');
 assert.ok(s.stats.oatsHarvested>0&&s.stats.pulsesHarvested>0,'different crops produce separately');
 assert.ok(s.stats.pulsesEaten>0,'beans and peas can actually feed people');
 assert.ok(s.households.some(h=>h.farmYear.cropYields.oats>0&&h.farmYear.cropYields.pulses>0));
 check(s);
});
test('sheep, dairy cows and draft oxen keep distinct headcounts and shearing requires a worker',()=>{
 const s=createWorld(7777);
 assert.ok(s.households.some(h=>h.sheep>0)&&s.households.some(h=>h.draftOxen>=2));
 advanceDays(s,365);
 assert.ok((s.stats.woolProduced||0)>0,'sheep shearing must produce real wool');
 assert.ok(s.people.some(p=>p.workDays.herd>0),'labor is physically performed');
 assert.equal(totals(s,'sheep'),s.economy.sheepInitial+(s.stats.sheepBorn||0)-(s.stats.sheepDied||0));
 check(s);
});
test('external grain is a paid, finite, delayed cargo, and off-map money is conserved',()=>{
 const s=createWorld(413),buyer=s.households.find(h=>h.coin>500&&h.tenure!=='demesne');
 buyer.grain=0;buyer.oats=0;buyer.pulses=0;
 s.economy.grainInitial=totals(s,'grain');s.economy.oatsInitial=totals(s,'oats');s.economy.pulsesInitial=totals(s,'pulses');
 const firstOutside=s.outside.grain,firstCoin=overview(s).coin;
 s.day=13; // Day 14 opens the bounded regional market; household can still purchase.
 advanceDays(s,1);
 const shipment=s.shipments.find(x=>x.kind==='outside-import'&&x.buyer===buyer.id);
 assert.ok(shipment,'reachable paid imports can be purchased, not conjured');
 assert.ok(s.outside.grain<firstOutside);
 assert.ok(overview(s).coin<firstCoin);
 assert.ok(!Number.isNaN(shipment.day)&&shipment.day>s.day);
 check(s);
 advanceDays(s,shipment.day-s.day);
 assert.ok(buyer.grain>0,'cargo reaches household only after travel');
 check(s);
});
test('wool export has a delayed delivery, a bounded buyer treasury and real local income',()=>{
 const s=createWorld(7777);advanceDays(s,365);
 assert.ok((s.stats.outsideExports||0)>0,'some wool reaches a finite neighbouring market');
 assert.ok((s.stats.woolExported||0)>0);
 assert.ok(s.outside.wool>0);
 assert.ok(s.outside.coin>=0);
 assert.ok((s.stats.outsideCoinIn||0)>0);
 check(s);
});
test('loan history records actual payments and guarantor never mints food',()=>{
 const s=createWorld(413);advanceDays(s,365*10);
 assert.ok(s.loans.length>0);
 assert.ok(Object.values(s.creditHistory||{}).every(x=>x.repaidKg>=0&&x.unpaidKg>=0));
 for(const l of s.loans)if(l.guarantorId)assert.ok(s.households.some(h=>h.id===l.guarantorId));
 check(s);
});
test('a restored new economy continues identically across crop harvest, births and external deliveries',()=>{
 const s=createWorld(43821);advanceDays(s,430);
 const text=serialize(s),restored=deserialize(text);
 assert.equal(serialize(restored),text);
 advanceDays(s,365);advanceDays(restored,365);
 assert.equal(serialize(s),serialize(restored));
 check(s);
});
test('historical v0.5 save with no separated seed stores does not receive free new crops or animals',()=>{
 const s=createWorld(413);
 delete s.outside;delete s.economy.outsideGrainInitial;delete s.economy.outsideCoinInitial;
 delete s.economy.oatsInitial;delete s.economy.pulsesInitial;delete s.economy.sheepInitial;delete s.economy.woolInitial;
 for(const h of s.households){
  h.grain+=h.oats+h.pulses;h.oats=0;h.pulses=0;
  h.cattle-=h.draftOxen;h.draftOxen=0;h.sheep=0;h.wool=0;h.dairyCows=h.cattle;
 }
 s.economy.grainInitial=totals(s,'grain');s.economy.cattleInitial=totals(s,'cattle');
 s.economy.forageInitial=+(s.pasture.reduce((n,x)=>n+x,0)+totals(s,'fodder')+(s.stats.forageConverted||0)).toFixed(2);
 const copy=deserialize(serialize(s));
 assert.ok(!copy.outside,'no artificial external market inserted into existing saves');
 advanceDays(copy,365);
 assert.ok(copy.households.every(h=>h.farmYear.mix===false));
 assert.equal(copy.stats.oatsHarvested||0,0);
 check(copy);
});
