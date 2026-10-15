import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advanceDays,audit,serialize,deserialize,workCapacity} from './model.js';

const near=(a,b,delta=1e-6)=>assert.ok(Math.abs(a-b)<delta,`expected ${a} ~ ${b}`);
const worker=(s,h)=>h.members.map(id=>s.people.find(p=>p.id===id)).find(p=>p?.alive&&p.age>=15);

test('work capacity is finite, increasing, and continuous across the obsolete health-25 cliff',()=>{
 const p={alive:true,age:30,health:100};
 for(const kind of ['farm','garden','herd','wood','build']){
  p.health=100;near(workCapacity(p,kind),1);
  p.health=75;near(workCapacity(p,kind),1);
  p.health=25;const a=workCapacity(p,kind);
  p.health=25.01;const b=workCapacity(p,kind);
  assert.ok(a>0&&a<1,`${kind}: weak adults still perform partial work`);
  assert.ok(b-a<.01,`${kind}: no discontinuity at health 25`);
  p.health=10;assert.ok(workCapacity(p,kind)>0);
  p.health=5;near(workCapacity(p,kind),0);
  p.health=0;near(workCapacity(p,kind),0);
 }
 p.health=90;p.age=14;near(workCapacity(p,'farm'),0);
 p.age=30;p.alive=false;near(workCapacity(p,'farm'),0);
});

test('weakened household plants fewer real hectares, never a full healthy day',()=>{
 function farmAt(health){
  const s=createWorld(413);
  const h=s.households.find(h=>h.fields.length>=10&&h.members.some(id=>s.people.some(p=>p.id===id&&p.alive&&p.age>=15)));
  assert.ok(h,'seed includes arable household');
  // All comparisons start from the same physical inventory and world day.
  s.day=64;h.focus='farm';
  const capable=worker(s,h);assert.ok(capable);
  for(const p of s.people)if(h.members.includes(p.id)&&p.age>=15&&p!==capable)p.health=5;
  capable.health=health;
  advanceDays(s,1);
  const ha=h.farmYear?.sownArea||0;
  const worked=capable.workDays?.farm||0;
  return {ha,worked,capable,s};
 }
 const strong=farmAt(85),weak=farmAt(25),extreme=farmAt(10),none=farmAt(5);
 assert.ok(strong.ha>0);
 assert.ok(weak.ha>0&&weak.ha<strong.ha,
  `strong ${strong.ha} weak ${weak.ha}`);
 assert.ok(extreme.ha>=0&&extreme.ha<weak.ha);
 assert.ok(none.ha<weak.ha);
 assert.ok(weak.worked>0&&weak.worked<1,`workdays=${weak.worked}`);
 assert.ok(strong.worked>=weak.worked);
});

test('fractional garden and building progress cannot award a complete day at low health',()=>{
 const s=createWorld(7777);
 const h=s.households.find(h=>h.fields.length>=10&&worker(s,h));
 const p=worker(s,h);
 s.day=79;
 h.focus='wood';h.grain=Math.max(h.grain,500);
 for(const adult of s.people.filter(q=>h.members.includes(q.id)&&q.alive&&q.age>=15))adult.health=5;
 p.health=25;
 // Disable farming in this controlled work-budget experiment, not production.
 h.farmYear={year:0,active:[],plannedArea:0,sownArea:0,harvestedArea:0,tended:0,
  cropYields:{grain:0,oats:0,pulses:0},cropSeeds:{grain:0,oats:0,pulses:0}};
 advanceDays(s,1);
 const g=h.gardenYear;
 assert.ok(g.prepared>0&&g.prepared<1,`garden work credited ${g.prepared}`);
 assert.ok((p.workDays?.garden||0)>0&&(p.workDays?.garden||0)<1);
});

test('full-health workday remains one, and a year under stress conserves all stocks',()=>{
 const s=createWorld(43821);
 const p=s.people.find(p=>p.alive&&p.age>=18);
 p.health=80;
 assert.equal(workCapacity(p,'farm'),1);
 for(let i=0;i<365;i++)advanceDays(s,1);
 const checked=audit(s);
 assert.ok(checked.ok,checked.issues.join('; '));
});

test('graded labour saves and resumes with identical trajectories and fractional ledgers',()=>{
 const original=createWorld(10061);
 advanceDays(original,365*2+110);
 const loaded=deserialize(serialize(original));
 advanceDays(original,25);advanceDays(loaded,25);
 assert.equal(serialize(original),serialize(loaded));
 assert.ok(audit(original).ok);
});

test('customary obligations credit only whole days while retaining fractional physical effort',()=>{
 const s=createWorld(413);
 advanceDays(s,365);
 let seen=false;
 for(const h of s.households){
  const a=h.manorAgreement;
  if(!a)continue;
  seen=true;
  assert.ok(Number.isInteger(a.served),'tenure credits must be whole days');
  assert.ok(a.served>=0&&a.served<=a.dueDays);
  assert.ok(Number.isFinite(a.serviceProgress||0));
  assert.ok((a.serviceProgress||0)>=0&&(a.serviceProgress||0)<1,'incomplete fractions carry over');
 }
 assert.ok(seen,'sample has customary tenants');
 const result=audit(s);assert.ok(result.ok,result.issues.join('; '));
});
