import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorld,advanceDays,serialize,audit,deserialize} from './model.js';
import {walkable} from './navigation.js';
import {SUPPORTED_SPEEDS,timeMode,integrateClock,dayClock,dayPhase,planSubday,sampleSubday,makeFastView,advanceFastView} from './subday.js';

test('two time levels are explicit: fine 0.25/0.5/1, coarse 5/20 and pause',()=>{
 assert.deepEqual(SUPPORTED_SPEEDS,[0,.25,.5,1,5,20]);
 assert.deepEqual(SUPPORTED_SPEEDS.map(timeMode),['paused','fine','fine','fine','coarse','coarse']);
 assert.throws(()=>timeMode(1.5),/Unsupported/);
 assert.equal(dayClock(0),'00:00');
 assert.equal(dayClock(.5),'12:00');
 assert.equal(dayClock(1),'23:59');
 assert.equal(dayPhase(.6),'Рабочий день');
});

test('integrating either view advances exactly the same number of authoritative days',()=>{
 function clock(speeds){
  let acc=0,days=0;
  for(const [speed,frames] of speeds)for(let i=0;i<frames;i++){
   const step=integrateClock(acc,.05,speed);
   days+=step.days;acc=step.phase;
  }
  return {days,acc};
 }
 const baseline=clock([[1,200]]);
 const mixed=clock([[.25,400],[.5,200],[1,100],[5,20],[20,5]]);
 // Simulated elapsed days are 5+5+5+5+5 = 25, independent of rendering level.
 assert.equal(baseline.days,10);
 assert.equal(mixed.days,25);
 assert.ok(Math.abs(mixed.acc)<1e-7);
 assert.deepEqual(integrateClock(.4,.05,0),{days:0,phase:.4,mode:'paused'});
});

test('individual morning, outbound, work and return motion follows existing destinations',()=>{
 const s=createWorld(17);advanceDays(s,1);
 const plan=planSubday(s);
 assert.equal(plan.day,s.day);
 assert.equal(plan.plans.size,s.people.filter(p=>p.alive).length);
 const p=s.people.find(p=>p.alive&&p.job!=='home'&&!p.travel&&plan.plans.get(p.id)?.length>3);
 assert.ok(p,'requires actual employed worker on the first day');
 const schedule=plan.plans.get(p.id);
 assert.ok(schedule.departure<schedule.arrival);
 assert.ok(schedule.arrival<schedule.returnStart);
 assert.ok(schedule.returnStart<schedule.returnEnd);
 const home=sampleSubday(p,plan,.06),out=sampleSubday(p,plan,(schedule.departure+schedule.arrival)/2);
 const workplace=sampleSubday(p,plan,(schedule.arrival+schedule.returnStart)/2);
 const back=sampleSubday(p,plan,(schedule.returnStart+schedule.returnEnd)/2);
 const evening=sampleSubday(p,plan,.99);
 assert.equal(home.activity,'home');
 assert.equal(out.activity,'travel');
 assert.equal(workplace.activity,p.job);
 assert.equal(back.activity,'return');
 assert.equal(evening.activity,'home');
 for(const point of [home,out,workplace,back,evening]){
  assert.ok(walkable(s,point.x,point.y),JSON.stringify(point));
  assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));
 }
 assert.ok(Math.hypot(workplace.x-schedule.to.x,workplace.y-schedule.to.y)<.32);
});

test('planning and sampling a full day do not spend food, RNG, timber or produce fictitious workers',()=>{
 const world=createWorld(413);advanceDays(world,30);
 const snapshot=serialize(world),plan=planSubday(world);
 for(const p of world.people)if(p.alive){
  for(let i=0;i<=24;i++)sampleSubday(p,plan,i/24);
 }
 assert.equal(serialize(world),snapshot);
 assert.ok(audit(world).ok,audit(world).issues.join('; '));
 assert.ok(plan.plans.size<=world.people.length);
 const counts=Object.values(plan.counters).reduce((a,b)=>a+b,0);
 assert.equal(counts,world.people.filter(p=>p.alive).length);
});

test('coarse overview uses daily real endpoints, eases without creating agents and freezes when paused',()=>{
 const s=createWorld(413),fast=makeFastView();advanceFastView(fast,s,.016);
 const alive=s.people.filter(p=>p.alive);
 assert.equal(fast.positions.size,alive.length);
 const original=serialize(s),pre=new Map(fast.positions);
 advanceFastView(fast,s,0);
 assert.deepEqual(fast.positions,pre);
 assert.equal(serialize(s),original);
 advanceDays(s,1);
 advanceFastView(fast,s,.04);
 assert.equal(fast.positions.size,s.people.filter(p=>p.alive).length);
 for(const p of s.people.filter(p=>p.alive)){
  const pos=fast.positions.get(p.id);
  assert.ok(Number.isFinite(pos.x)&&Number.isFinite(pos.y));
 }
});

test('all speed schedules with equal total days yield byte-identical material histories',()=>{
 function run(speeds){
  const s=createWorld(9001);let acc=0,planning=null;
  for(const [speed,frames] of speeds)for(let frame=0;frame<frames;frame++){
   const step=integrateClock(acc,.05,speed);
   if(step.days)advanceDays(s,step.days);
   acc=step.phase;
   if(step.mode==='fine'&&(!planning||planning.day!==s.day))planning=planSubday(s);
   if(step.mode==='fine'){
    for(const p of s.people.slice(0,4))if(p.alive)sampleSubday(p,planning,acc);
   }
  }
  return {state:serialize(s),acc,day:s.day};
 }
 const slow=run([[1,200]]);
 const mixed=run([[.25,400],[.5,100],[5,10],[1,100]]);
 // 400*.05*.25=5, 100*.05*.5=2.5, 10*.05*5=2.5, 100*.05=5 => 15.
 const normal=run([[1,300]]);
 assert.equal(slow.day,createWorld(9001).day+10);
 assert.equal(mixed.day,normal.day);
 assert.equal(mixed.state,normal.state);
 assert.ok(Math.abs(mixed.acc-normal.acc)<1e-7);
 assert.equal(serialize(deserialize(mixed.state)),mixed.state);
});

test('phone toolbar exposes two detail levels with a working clock',()=>{
 const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('./styles.css',import.meta.url),'utf8');
 assert.match(app,/timeMode\(next\)/);
 assert.match(app,/planSubday\(sim\)/);
 assert.match(app,/advanceFastView\(fastView,sim,dt\)/);
 assert.match(html,/id="time-detail"/);
 assert.match(html,/id="time-stage"/);
 assert.match(html,/id="time-fill"/);
 assert.match(css,/time-detail\[data-mode="fine"\]/);
});
