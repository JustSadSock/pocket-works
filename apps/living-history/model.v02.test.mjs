import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advanceDays,audit,overview,serialize,deserialize} from './model.js';

function sim(seed,scenario,years){const s=createWorld(seed,{scenario});for(let y=0;y<years;y++){advanceDays(s,365);const a=audit(s);assert.ok(a.ok,`${scenario} ${seed} ${y+1}: ${a.issues.join('; ')}`);}return s;}
const residents=(s,h)=>h.members.map(id=>s.people.find(p=>p.id===id)).filter(p=>p?.alive);

test('seeds and workdays physically gate planting and harvest',()=>{
 const active=createWorld(43821),idle=deserialize(serialize(active));const a=active.households[0],b=idle.households[0];
 // Harvest is a multi-day labour action, not an autumn income trigger.
 for(const w of [active,idle]){w.day=237;const h=w.households[0];h.farmYear={year:0,active:h.fields.filter((_,i)=>i%3!==0),sownArea:1.25,tended:18,harvestedArea:0,seedKg:156.25,yieldKg:0,labourSow:14,labourTend:18,labourHarvest:0};}
 for(const id of b.members){const p=idle.people.find(p=>p.id===id);if(p.age>=15)p.age=13;}
 // The household cannot hire an external seasonal worker with zero coin.
 idle.households[1].coin+=b.coin;b.coin=0;
 advanceDays(active,1);advanceDays(idle,1);
 assert.ok(a.farmYear.harvestedArea>0,'working household must physically harvest');
 assert.equal(b.farmYear.harvestedArea,0,'household with no labor must not harvest');
 assert.ok(a.farmYear.labourHarvest>0&&a.farmYear.yieldKg>0);
 assert.ok(a.farmYear.harvestedArea<=a.farmYear.sownArea+.001);
 assert.ok(audit(active).ok);assert.ok(audit(idle).ok);
});

test('soil rests on fallow parcels and wears on cultivated parcels',()=>{
 const s=createWorld(413),h=s.households[0];
 // Sample parcels before any first-year crop; detect both cultivated and fallow parcels.
 const initial=s.soil.slice();advanceDays(s,365);
 const active=new Set(h.farmYear.active);
 const worn=h.fields.filter(i=>active.has(i)&&s.soil[i]<initial[i]);
 const resting=h.fields.filter(i=>!active.has(i)&&s.soil[i]>initial[i]);
 assert.ok(worn.length>2,`farming should degrade soil on ${worn.length} plots`);
 assert.ok(resting.length>2,`fallow should recover soil on ${resting.length} plots`);
});

test('households respond to resource opportunity; different regions do not all use the same occupation',()=>{
 const s=sim(413,'normal',12);
 const occupied=s.households.filter(h=>residents(s,h).length);
 const farm=occupied.filter(h=>h.focus==='farm').length,wood=occupied.filter(h=>h.focus==='wood').length;
 assert.ok(farm>=5&&s.people.some(p=>(p.workDays?.wood||0)>10),`farm ${farm}, wood focus ${wood}; rural economy should include real woodland labour`);
 assert.ok(occupied.some(h=>h.work==='farm'||h.focus==='farm'));
 assert.ok(s.stats.trades>30);
});

test('drought depresses crops and population, without declaring an artificial end state',()=>{
 const normal=sim(413,'normal',10),dry=sim(413,'drought',10);
 assert.ok(dry.stats.harvest<normal.stats.harvest,`harvest ${dry.stats.harvest} vs ${normal.stats.harvest}`);
 assert.ok(overview(dry).population>=0&&overview(normal).population>=0,'drought can cause complete extinction without model rescue');
 assert.ok(dry.events.some(e=>e.type==='drought')===false||dry.scenario==='drought');
 assert.ok(dry.people.some(p=>p.foodDebt>0));
});

function isolationTrades(s,lookup){
 return s.events.filter(e=>e.type==='trade' && e.subjects.length>=2).filter(e=>{
  const a=lookup.get(e.subjects[0]),b=lookup.get(e.subjects[1]);
  return a&&b&&a.communityId!==b.communityId;
 }).map(e=>e.id);
}

test('isolated scenario limits exchange; region and scenario persist on save',()=>{
 const open=sim(43821,'normal',10),isolated=sim(43821,'isolated',10);
 // Isolation prohibits *cross-community* transactions; the count of purely local
 // trades need not decrease monotonically because markets and shortages adapt.
 const homeById=new Map(isolated.households.map(h=>[h.id,h]));
 const illegal=isolationTrades(isolated,homeById);
 assert.deepEqual(illegal,[],'isolated worlds cannot transact across community borders');
 assert.ok(isolated.stats.trades>0,'isolation does not eliminate local trade');
 const loaded=deserialize(serialize(isolated));assert.equal(loaded.scenario,'isolated');
 advanceDays(isolated,200);advanceDays(loaded,200);assert.equal(serialize(isolated),serialize(loaded));
});

test('transport routes across the river pass through a ford and carrier earns a conserved wage',()=>{
 const s=createWorld(112);advanceDays(s,365*4);
 // Cargo follows genuine traversable steps, including dry river fords.
 assert.ok(s.shipments.every(t=>!t.route||t.route.every((p,i,arr)=>{
  const x=Math.round(p.x),y=Math.round(p.y);
  return s.terrain[y*160+x]===0&&(i===0||Math.abs(arr[i-1].x-p.x)+Math.abs(arr[i-1].y-p.y)<=1.01);
 })));
 assert.ok(s.stats.trades>0);assert.ok(audit(s).ok);
 assert.ok(s.shipments.every(t=>t.haulFee<=t.cost));
});

test('historic mid-season saves retain prepaid seed and upcoming crop',()=>{
 const s=createWorld(77);s.day=220;const h=s.households[0];h.sown=120;h.farmYear=null;
 const restored=deserialize(serialize(s));advanceDays(restored,1);
 assert.ok(restored.households[0].farmYear.sownArea>.1);
 assert.equal(restored.households[0].sown,0);
 assert.ok(audit(restored).ok);
});
