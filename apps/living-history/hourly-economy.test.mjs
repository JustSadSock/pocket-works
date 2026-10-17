import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advanceDays,serialize,deserialize,audit} from './model.js';
import {scheduleWork,WORK_HOURS,timeAt,commitWork,shiftAudit} from './work-time.js';
import {planSubday,sampleSubday,activeShiftCounts,integrateClock} from './subday.js';

test('a worker has exactly one physically timed 8.5-hour budget including round-trip road effort',()=>{
 const s=createWorld(413),h=s.households[0],p=s.people.find(p=>p.houseId===h.id&&p.age>=18);
 const far={x:h.x+8,y:h.y+7};
 const short=scheduleWork(s,p,'wood',h);
 const long=scheduleWork(s,p,'wood',far);
 assert.equal(short.travelHours,0);assert.equal(short.workHours,WORK_HOURS);
 assert.ok(long.workHours<short.workHours);
 assert.ok(long.travelHours>0);
 assert.ok(Math.abs(long.workHours+long.travelHours-WORK_HOURS)<.001);
 assert.ok(long.depart>=7&&long.depart<8);
 assert.ok(long.arrive>long.depart);
 assert.ok(long.returnStart>long.arrive);
 assert.ok(long.end>long.returnStart);
 assert.equal(timeAt(long,0).phase,'home');
 assert.equal(timeAt(long,long.arrive/24-.00001).phase,'travel');
 assert.equal(timeAt(long,(long.arrive+long.returnStart)/48).phase,'work');
 assert.equal(timeAt(long,(long.returnStart+long.end)/48).phase,'return');
 const before=serialize(s);
 assert.equal(scheduleWork(s,p,'wood',far).workHours,long.workHours);
 assert.equal(serialize(s),before,'budget calculation consumes no RNG or resources');
});

test('real economy books one saved shift per worker and limits work to available hours',()=>{
 const s=createWorld(9001);
 let sawFarm=false,sawWood=false,sawGarden=false,sawCommute=false;
 for(let i=0;i<390;i++){
  advanceDays(s,1);
  const people=s.people.filter(p=>p.alive&&p.dailyShift?.day===s.day);
  const ids=new Set();
  for(const p of people){
   const q=p.dailyShift;
   assert.ok(!ids.has(p.id));ids.add(p.id);
   assert.ok(q.workHours>0&&q.workHours<=WORK_HOURS+.001);
   assert.ok(q.travelHours>=0);
   assert.ok(q.workHours+q.travelHours<=WORK_HOURS+.02);
   assert.equal(q.fraction,Math.round(q.workHours/WORK_HOURS*10000)/10000);
   if(q.kind==='farm')sawFarm=true;
   if(q.kind==='wood')sawWood=true;
   if(q.kind==='garden')sawGarden=true;
   if(q.travelHours>.01)sawCommute=true;
  }
  assert.deepEqual(shiftAudit(s),[]);
 }
 assert.ok(sawFarm,'genuine fieldwork');
 assert.ok(sawWood,'genuine logging');
 assert.ok(sawGarden,'genuine gardening');
 assert.ok(sawCommute,'workers genuinely consume road time');
 assert.ok(s.stats.laborHours>0);
 assert.ok(s.stats.commuteHours>0);
 const report=audit(s);assert.ok(report.ok,report.issues.slice(0,5).join('; '));
});

test('subday drawing reads the actual recorded work slot instead of choosing its own hours',()=>{
 const s=createWorld(413);
 let target=null;
 for(let i=0;i<95&&!target;i++){
  advanceDays(s,1);
  target=s.people.find(p=>p.alive&&p.dailyShift?.day===s.day&&p.dailyShift.travelHours>.05);
 }
 assert.ok(target);
 const q=target.dailyShift;
 const before=serialize(s),plan=planSubday(s),p=plan.plans.get(target.id);
 assert.deepEqual(p.shift,q);
 assert.ok(Math.abs(p.departure-q.depart/24)<.0001);
 assert.ok(Math.abs(p.arrival-q.arrive/24)<.0001);
 assert.ok(Math.abs(p.returnStart-q.returnStart/24)<.0001);
 for(const [hour,activity] of [[q.depart-.02,'home'],[(q.depart+q.arrive)/2,'travel'],[(q.arrive+q.returnStart)/2,q.kind],[(q.returnStart+q.end)/2,'return'],[q.end+.02,'home']]){
  const at=sampleSubday(target,plan,hour/24);
  assert.equal(at.activity,activity);
  assert.ok(Number.isFinite(at.x)&&Number.isFinite(at.y));
 }
 const counts=activeShiftCounts(plan,(q.arrive+q.returnStart)/48);
 assert.ok(counts.work>0);
 assert.equal(serialize(s),before,'planning and rendering never mutate or spend real inventory');
});

test('the same physical history is produced by 1x and a mixture of 0.25x, 0.5x, 5x and 20x',()=>{
 const start=serialize(createWorld(2026));
 function run(segments){
  const s=deserialize(start);let frac=0;
  for(const [speed,n] of segments)for(let i=0;i<n;i++){
   const t=integrateClock(frac,.05,speed);
   if(t.days)advanceDays(s,t.days);
   frac=t.phase;
  }
  return {state:serialize(s),frac};
 }
 const mixed=run([[.25,400],[.5,100],[5,10],[20,10]]);
 // 5+2.5+2.5+10 = 20 simulated days.
 const standard=run([[1,400]]);
 assert.equal(mixed.state,standard.state);
 assert.ok(Math.abs(mixed.frac-standard.frac)<1e-7);
});

test('legacy saves load without new labor clock and run identically after migration',()=>{
 const old=createWorld(77);advanceDays(old,45);
 const saved=JSON.parse(serialize(old));
 for(const p of saved.people)delete p.dailyShift;
 delete saved.stats.laborHours;delete saved.stats.commuteHours;
 const s=deserialize(JSON.stringify(saved)),copy=deserialize(JSON.stringify(saved));
 for(let d=0;d<90;d++){advanceDays(s,1);advanceDays(copy,1);}
 assert.equal(serialize(s),serialize(copy));
 const report=audit(s);assert.ok(report.ok,report.issues.slice(0,5).join('; '));
});
