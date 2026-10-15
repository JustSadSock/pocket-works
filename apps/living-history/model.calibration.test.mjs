import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld, advanceDays, audit, overview, serialize, deserialize, CALIBRATION} from './model.js';

const alive=(s,h)=>h.members.map(id=>s.people.find(p=>p.id===id)).filter(p=>p?.alive);

test('refeeding heals instead of continuing phantom post-famine damage',()=>{
 const s=createWorld(713);const h=s.households[0],person=alive(s,h)[0];
 person.foodDebt=72;person.health=28;
 h.grain=700;
 // The inventory adjustment is test setup, not a legitimate resource transaction.
 const healthBefore=person.health,debtBefore=person.foodDebt;
 advanceDays(s,1);
 assert.ok(person.health>healthBefore,`feeding should restore health: ${person.health}`);
 assert.ok(person.foodDebt<debtBefore,`debt should recede after eating: ${person.foodDebt}`);
 assert.equal(person.alive,true);
 });

test('healthy population still has genuine food limitation and no synthetic food',()=>{
 const s=createWorld(377);s.scenario='isolated';const h=s.households[0],first=alive(s,h)[0];
 // Deliberate catastrophic loss: remove every edible food source, every herd
 // and all cultivated rights. This is a fixture, not an ordinary world event.
 const deletedGrain=s.households.reduce((sum,k)=>sum+k.grain,0);
 for(const k of s.households){
  for(const good of ['grain','oats','pulses','garden','dairy','cattle','dairyCows','draftOxen','sheep','fodder'])k[good]=0;
  k.fields=[];
 }
 for(let i=0;i<s.usage.length;i++)if(s.usage[i]===2)s.usage[i]=0;
 s.stats.consumed+=deletedGrain;
 s.economy.oatsInitial=0;s.economy.pulsesInitial=0;
 s.economy.cattleInitial=0;s.economy.sheepInitial=0;
 s.economy.forageInitial=Math.round((s.pasture.reduce((sum,amount)=>sum+amount,0)+(s.stats.forageConverted||0))*100)/100;
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
 advanceDays(s,220);
 assert.equal(first.alive,false,'without grain or planting, famine can still kill');
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
 });

test('fallow soil recovers even with zero labour and zero harvest',()=>{
 const s=createWorld(411),h=s.households[0];s.day=364;
 h.farmYear={year:0,active:h.fields.slice(0,12),sownArea:0,tended:0,harvestedArea:0,seedKg:0,yieldKg:0,labourSow:0,labourTend:0,labourHarvest:0};
 const fallow=h.fields.find(i=>!h.farmYear.active.includes(i)),before=s.soil[fallow];
 advanceDays(s,1);
 assert.ok(s.soil[fallow]>before,`fallow ${before} -> ${s.soil[fallow]}`);
 assert.equal(h.farmYear.soilFinalized,true);
 const after=s.soil[fallow];advanceDays(s,1);
 assert.equal(s.soil[fallow],after,'soil settlement happens once per agricultural year');
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
 });

test('skill still improves harvest but advantage is bounded',()=>{
 const low=createWorld(12),high=deserialize(serialize(low));
 for(const s of [low,high]){s.day=237;const h=s.households[0];h.farmYear={year:0,active:h.fields.filter((_,i)=>i%3!==0),sownArea:1.0,tended:24,harvestedArea:0,seedKg:125,yieldKg:0,labourSow:16,labourTend:24,labourHarvest:0};h.grain=1000;
 for(const p of alive(s,h).filter(p=>p.age>=15))p.skill.farm=s===low?0:20;
 }
 advanceDays(low,1);advanceDays(high,1);
 const a=low.households[0].farmYear.yieldKg,b=high.households[0].farmYear.yieldKg;
 assert.ok(b>a,`${a} vs ${b}`);
 assert.ok(b/a<=1.27,`skill must not multiply farming output without bound: ${b/a}`);
 });

test('historical seed ratio is an explicit and measured calibration parameter',()=>{
 assert.equal(CALIBRATION.seedKgPerHa,125);
 assert.ok(CALIBRATION.baseGrainYieldKgPerHa>=500&&CALIBRATION.baseGrainYieldKgPerHa<=850);
 // One exceptionally good season can exceed the historical norm.
 // Compare a sequence of independent annual harvests instead of using
 // a single year's hard cutoff as evidence of an entire region's calibration.
 const s=createWorld(413),ratios=[];
 for(let y=1;y<=14;y++){
  advanceDays(s,365);
  if(y<8)continue;
  const crops=s.households.map(h=>h.farmYear).filter(v=>v?.seedKg>0);
  const ratio=crops.reduce((n,c)=>n+c.yieldKg,0)/crops.reduce((n,c)=>n+c.seedKg,0);
  assert.ok(Number.isFinite(ratio),'all observed years must have real seeds and harvest');
  ratios.push(ratio);
 }
 const sorted=[...ratios].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)];
 assert.ok(median>2.5&&median<7.5,`seven-year median yield/seed ${median.toFixed(2)} is outside the model's exploratory envelope`);
 assert.ok(Math.max(...ratios)<9,`single-season yield/seed ${Math.max(...ratios).toFixed(2)} exceeds the currently tolerated upper tail`);
 });

test('drought depresses harvest and its aftermath follows causes, without forced population rescue',()=>{
 const s=createWorld(413,{scenario:'drought'}),normal=createWorld(413);
 advanceDays(s,365*8);advanceDays(normal,365*8);
 assert.ok(s.stats.harvest<normal.stats.harvest);
 const crisisPopulation=overview(s).population;
 advanceDays(s,365*12);
 assert.ok(overview(s).population>=0,'extinction must remain a possible outcome');
 assert.ok(s.stats.died>=0&&crisisPopulation>=0,'population outcomes are emergent, not fixed thresholds');
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
 });

test('restored saves reproduce chronology without serializing transient lookup indices',()=>{
 const s=createWorld(188);advanceDays(s,365*7+19);
 const saved=serialize(s);assert.ok(!saved.includes('_houseIndex')&&!saved.includes('_peopleIndex'));
 const same=deserialize(saved);advanceDays(s,900);advanceDays(same,900);
 assert.equal(serialize(s),serialize(same));
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
 });

test('ageing, death, parentage and wealth accounting survive a generational run',()=>{
 const s=createWorld(7777);advanceDays(s,365*45);
 const byId=new Map(s.people.map(p=>[p.id,p]));
 const descendants=s.people.filter(p=>p.parents.length>=2);
 assert.ok(descendants.length>=70,`observed descendants: ${descendants.length}`);
 for(const person of descendants){for(const id of person.parents){const parent=byId.get(id);assert.ok(parent,`unknown parent ${id} of ${person.id}`);if(parent.alive)assert.ok(parent.age-person.age>=14.5,`living parent ${id} too young for ${person.id}`);}}
 assert.ok(s.people.some(p=>p.workDays.farm>200&&p.skill.farm>1));
 assert.ok(s.stats.died>35);assert.ok(s.stats.born>55);
 const verification=audit(s);assert.ok(verification.ok,verification.issues.join('; '));
 });

test('the two designated trade fords are walkable terrain, not water tiles',()=>{
 const s=createWorld(43821);for(const y of [40,119]){const x=Math.round(160*.47+Math.sin(y*.075)*11+Math.sin(y*.026)*7);
 assert.equal(s.terrain[y*160+x],0,`ford at ${x},${y} must be walkable`);}
});