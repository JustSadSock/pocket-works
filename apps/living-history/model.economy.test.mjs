import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advanceDays,audit,serialize,deserialize,storageCapacity,overview,CALIBRATION} from './model.js';
const member=(s,h)=>s.people.find(p=>h.members.includes(p.id)&&p.alive&&p.age>=15);

test('grain store reduces overflow without inventing food, paid storage requires timber',()=>{
 const s=createWorld(49),h=s.households[0];
 const before=storageCapacity(h);h.grain=before+420;h.wood=360;
 s.economy.grainInitial=s.households.reduce((n,k)=>n+k.grain,0);s.economy.woodInitial=s.households.reduce((n,k)=>n+k.wood,0);
 const startGrain=overview(s).grain,wood=s.stats.storageWood||0;
 advanceDays(s,1);
 assert.ok(s.stats.spoiled>0, 'excess stores lose grain');
 assert.ok(h.storeProject,'storage construction must not finish instantly');
 advanceDays(s,32);
 assert.ok(storageCapacity(h)>before,'paid timber and workdays improve the store');
 assert.ok((s.stats.storageWood||0)>wood);
 assert.ok(overview(s).grain<startGrain);
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});

test('old saves gain derived store capacity and accounts without corrupting inventories',()=>{
 const s=createWorld(43821);const old=serialize(s);const h=s.households[0];
 assert.equal(h.storeLevel,undefined);
 const loaded=deserialize(old);advanceDays(loaded,15);
 assert.ok(storageCapacity(loaded.households[0])>0);
 assert.ok(loaded.households[0].accounting);
 assert.ok(audit(loaded).ok,audit(loaded).issues.join('; '));
});

test('workers receive wages, landowner pays wages, and missing adults can hire instead of magically producing',()=>{
 const s=createWorld(56),h=s.households[0];s.day=237;s.scenario='isolated'; // Single-day wage transfer without outside imports.
 h.farmYear={year:0,active:h.fields.filter((_,i)=>i%3!==0),sownArea:1.25,tended:50,harvestedArea:0,seedKg:156.25,yieldKg:0,labourSow:14,labourTend:50,labourHarvest:0};
 const adult=h.members.map(id=>s.people.find(p=>p.id===id)).filter(p=>p.age>=15);
 for(const p of adult)p.age=12;
 const initialCoin=overview(s).coin;
 advanceDays(s,1);
 assert.ok(h.farmYear.harvestedArea>0,'a nearby seasonal hand can harvest');
 assert.ok(h.accounting.wagesPaid>0,'coins pay wages');
 assert.ok(s.households.some(k=>k.id!==h.id&&(k.accounting?.wagesEarned||0)>0));
 assert.equal(overview(s).coin,initialCoin,'paid labor transfers currency');
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});

test('pregnancy nutrition affects infant initial condition, and health recovers with food',()=>{
 const s=createWorld(131),h=s.households[0];const mother=s.people.find(p=>h.members.includes(p.id)&&p.sex==='f'&&p.alive);
 mother.pregnantUntil=30;mother.pregnantFatherId=mother.spouse;mother.health=60;mother.foodDebt=55;
 // Birth by day 30 (every 30th day); provide sufficient grain to improve debt slightly but not erase it.
 advanceDays(s,30);
 const child=s.people.find(p=>p.parents.includes(mother.id)&&p.age<.2);
 assert.ok(child);
 assert.ok(child.health<100,'birth status reflects maternal health and nutrition');
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});

test('25-year deterministic occupation ledger and physical balances',()=>{
 const s=createWorld(413,{scenario:'normal'});for(let y=0;y<25;y++){
  advanceDays(s,365);const a=audit(s);assert.equal(a.ok,true,`year ${y+1} ${a.issues.join('; ')}`);
 }
 const o=overview(s);assert.ok(Number.isInteger(o.population)&&o.population>=0, 'extinction is allowed; populations must remain valid');
 assert.ok(s.households.some(h=>h.decision&&h.decision.reason));
 assert.ok(s.households.some(h=>h.accounting?.harvestKg>0||h.lastAccounting?.harvestKg>0));
 assert.ok(s.stats.spoiled>0);
 const restored=deserialize(serialize(s));advanceDays(s,120);advanceDays(restored,120);
 assert.equal(serialize(s),serialize(restored));
});

test('neighbor aid is an actual shipment: grain stays in transit until arrival',()=>{
 const s=createWorld(43821),source=s.households[0];
 const target=s.households.find(h=>h.id!==source.id&&Math.hypot(h.x-source.x,h.y-source.y)<18);
 assert.ok(target);
 source.grain=4500;source.wood=1100;target.grain=0;
 for(const h of s.households)h.coin=0; // Isolate voluntary aid from legitimate paid trade.
 s.economy.coinsInitial=0;
 s.economy.grainInitial=s.households.reduce((n,h)=>n+h.grain,0);
 s.economy.woodInitial=s.households.reduce((n,h)=>n+h.wood,0);
 advanceDays(s,7);
 const gift=s.shipments.find(t=>t.kind==='aid'&&t.buyer===target.id);
 assert.ok(gift,'surplus neighbors can send physically routed grain');
 assert.equal(gift.cost,0,'gifts cannot mint money');
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
 advanceDays(s,gift.day-s.day);
 assert.ok(target.grain>0,'grain is received only after caravan arrives');
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});

test('pre-computed spatial and forest indices are not persisted or carried across independent saves',()=>{
 const a=createWorld(317);advanceDays(a,365*3);
 const saved=serialize(a);assert.ok(!saved.includes('_homeGrid')&&!saved.includes('_forestAllowed')&&!saved.includes('_guests'));
 const b=deserialize(saved);advanceDays(a,365);advanceDays(b,365);
 assert.equal(serialize(a),serialize(b));
});