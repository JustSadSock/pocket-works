import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advanceDays,overview,audit,serialize,deserialize} from './model.js';
const lived=(s)=>s.people.filter(p=>p.alive);
const populationByCommunity=(s)=>s.communities.map(c=>({name:c.name,pop:lived(s).filter(p=>s.households.find(h=>h.id===p.houseId)?.communityId===c.id).length}));

test('initial parent-child generations have biologically possible ages',()=>{
 for(const seed of [1,413,43821,71331]){
  const s=createWorld(seed);const byId=new Map(s.people.map(p=>[p.id,p]));
  for(const child of s.people.filter(p=>p.parents.length)){
   assert.ok(child.parents.length>=1&&child.parents.length<=2,'an elder may be a widowed sole known parent');
   for(const id of child.parents)assert.ok(byId.get(id)?.age-child.age>=16,`seed ${seed}: implausible parent age for ${child.id}`);
  }
 }
});
test('individual life course: ageing, work experience, childbirth, adult offspring, death',()=>{
 const s=createWorld(43821);const initialAge=new Map(s.people.map(p=>[p.id,p.age]));const initialSkills=new Map(s.people.map(p=>[p.id,p.skill.farm]));
 advanceDays(s,365*12);
 const farmer=s.people.find(p=>p.alive&&initialAge.has(p.id)&&p.workDays.farm>25);
 assert.ok(farmer,'at least one initial citizen must remain an experienced farmer');
 assert.ok(Math.abs(farmer.age-initialAge.get(farmer.id)-12)<.0001);
 assert.ok(farmer.skill.farm>initialSkills.get(farmer.id),'farming experience must be earned by work');
 assert.ok(s.people.some(p=>p.parents.length===2&&p.lifeLog[0].type==='origin'));
 assert.ok(s.stats.born>30&&s.stats.died>10);
 advanceDays(s,365*35);const descendants=s.people.filter(p=>p.parents.length);
 assert.ok(descendants.length>0&&descendants.some(p=>p.age>=18), 'offspring must mature naturally even if land scarcity prevents another generation');
 assert.ok(s.people.some(p=>!p.alive&&p.lifeLog?.some(e=>e.type==='death')));
 assert.ok(s.people.some(p=>p.lifeLog?.some(e=>e.type==='marriage')));
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});
test('a pregnant widow can give birth; spousal death releases partnership',()=>{
 const s=createWorld(7777),h=s.households[0],father=s.people.find(p=>p.id===h.members[0]);
 const mother=s.people.find(p=>p.id===h.members[1]);assert.equal(mother.spouse,father.id);
 mother.pregnantUntil=s.day+10;mother.pregnantFatherId=father.id;father.health=0;
 advanceDays(s,1);assert.equal(father.alive,false);assert.equal(mother.spouse,null);
 const before=s.stats.born;advanceDays(s,29);
 assert.equal(s.stats.born,before+1,'pregnancy must not be cancelled by father death');
 const child=s.people.at(-1);assert.deepEqual(child.parents,[mother.id,father.id]);
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});
test('harvest and logging productivity responds to learned skill',()=>{
 const lo=createWorld(542),hi=deserialize(serialize(lo));
 const a=lo.households[0],b=hi.households[0];
 for(const s of [lo,hi]){const h=s.households[0];h.wood=0;for(const p of s.people.filter(p=>h.members.includes(p.id)&&p.age>=15)){p.skill.wood=s===lo?0:3;}}
 advanceDays(lo,1);advanceDays(hi,1);
 assert.ok(b.wood>a.wood,`wood mastery must affect harvested quantity: ${a.wood} vs ${b.wood}`);
 // Equal weather, soil and sowing calendar, but high experienced farming yields more.
 const low=createWorld(999),high=deserialize(serialize(low));
 for(const s of [low,high]){s.day=259;const h=s.households[0];h.sown=1000;h.grain=400;for(const p of s.people.filter(p=>h.members.includes(p.id)&&p.age>=15))p.skill.farm=s===low?0:3;}
 advanceDays(low,1);advanceDays(high,1);
 assert.ok(high.stats.harvest>low.stats.harvest,'farm skill must increase output');
});
test('shipping uses a specific person and reserves the actual cargo and money',()=>{
 const s=createWorld(123);let t;
 for(let i=0;i<1000&&!t;i++){advanceDays(s,1);t=s.shipments[0];}
 assert.ok(t,'at least one transaction in the first 1000 days');assert.ok(t.carrierId);
 const carrier=s.people.find(p=>p.id===t.carrierId),sender=s.households.find(h=>h.id===t.seller);
 assert.ok(carrier?.travel&&carrier.workDays.haul>0);assert.equal(carrier.travel.end,t.departure+2*(t.day-t.departure));
 assert.ok(sender.coin>=0);
 const shipmentId=t.id,delivered=s.stats.delivered;
 advanceDays(s,t.day-s.day);
 assert.ok(s.stats.delivered>delivered);
 assert.ok(!s.shipments.some(v=>v.id===shipmentId));
 assert.ok(audit(s).ok,audit(s).issues.join('; '));
});
test('conservation of grain, wood and money, and traceability of families across four communities',()=>{
 for(const seed of [1,413,43821,71331]){
  const s=createWorld(seed),first=overview(s);advanceDays(s,365*24);const o=overview(s),report=audit(s);
  assert.ok(report.ok,`${seed}: ${report.issues.join('; ')}`);
  assert.equal(o.coin,first.coin);
  assert.ok(s.stats.harvest>0&&s.stats.trades>0&&s.stats.delivered>0);
  assert.equal(populationByCommunity(s).reduce((a,c)=>a+c.pop,0),o.population);
  assert.ok(s.households.length>=36);
  assert.ok(s.communities.every(c=>s.households.some(h=>h.communityId===c.id)));
  assert.ok(s.people.every(p=>p.lifeLog===undefined||Array.isArray(p.lifeLog)));
 }
});
test('save/restore preserves all people, marriages, shipments, and determinism',()=>{
 const s=createWorld(12102);advanceDays(s,365*11+3);
 const save=serialize(s),restored=deserialize(save);
 assert.equal(serialize(restored),save);
 advanceDays(s,365*3);advanceDays(restored,365*3);
 assert.equal(serialize(restored),serialize(s));
});
test('invariant checker detects synthetic grain and inconsistent marriages',()=>{
 const s=createWorld(11);s.households[0].grain+=15;
 assert.ok(audit(s).issues.some(x=>x.includes('сохранение зерна')));
 s.households[0].grain-=15;
 s.people[0].spouse=s.people[5].id;
 assert.equal(audit(s).ok,false);
});
test('v0.1.0 worlds with pre-carrier trade shipments remain readable',()=>{
 const s=createWorld(2456);
 for(let i=0;i<900&&!s.shipments.length;i++)advanceDays(s,1);
 assert.ok(s.shipments.length,'legacy sample must include shipments');
 for(const t of s.shipments){delete t.carrierId;delete t.departure;}
 for(const p of s.people){delete p.workDays;delete p.lifeLog;}
 delete s.economy.grainInitial;delete s.economy.woodInitial;
 const legacy=deserialize(serialize(s));
 advanceDays(legacy,180);
 assert.ok(audit(legacy).ok,audit(legacy).issues.join('; '));
});