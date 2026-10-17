import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorld,advanceDays,audit,serialize,deserialize,SIZE} from './model.js';
import {planSubday,sampleSubday,makeFastView,advanceFastView,integrateClock} from './subday.js';
import {walkable,pathPosition} from './navigation.js';
import {fieldAppearance,trailAppearance} from './visual-land.js';
const index=(x,y)=>y*SIZE+x;
const pointEqual=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<1e-8;

test('unemployed residents no longer orbit the home at 0.25x, 0.5x or 1x',()=>{
 const s=createWorld(413),plan=planSubday(s);
 const homes=new Map(s.households.map(h=>[h.id,h]));
 const residents=s.people.filter(p=>p.alive&&!p.dailyShift&&!p.travel);
 assert.ok(residents.length>40);
 for(const p of residents){
  const home=homes.get(p.houseId);
  for(const t of [0,.08,.21,.35,.5,.67,.83,1]){
   const at=sampleSubday(p,plan,t);
   assert.equal(at.activity,'home');
   assert.deepEqual({x:at.x,y:at.y},{x:home.x,y:home.y});
  }
 }
 const fast=makeFastView();
 advanceFastView(fast,s,.016);
 const old=new Map(fast.positions);
 for(let i=0;i<24;i++)advanceFastView(fast,s,.016);
 for(const p of residents)assert.ok(pointEqual(fast.positions.get(p.id),old.get(p.id)));
});

test('working farmhands follow paid routes to one real strip and move in straight furrows, never circles',()=>{
 const s=createWorld(9001);
 let worker=null,plan=null;
 for(let i=0;i<220&&!worker;i++){
  advanceDays(s,1);plan=planSubday(s);
  worker=s.people.find(p=>p.alive&&p.dailyShift?.day===s.day&&p.dailyShift.kind==='farm'&&p.dailyShift.routeCells?.length>5);
 }
 assert.ok(worker,'found true worker with a physical field commute');
 const schedule=plan.plans.get(worker.id),shift=worker.dailyShift;
 assert.equal(schedule.length,shift.routeCells.length-1);
 assert.equal(s.usage[index(shift.to.x,shift.to.y)],2,'workplace must be an owned or leased strip');
 for(const at of schedule.route){
  assert.ok(walkable(s,at.x,at.y),`road route entered closed land: ${JSON.stringify(at)}`);
 }
 const midway=(shift.depart+shift.arrive)/48;
 const walking=sampleSubday(worker,plan,midway);
 assert.equal(walking.activity,'travel');
 const expected=pathPosition(schedule.route,.5);
 assert.ok(Math.hypot(walking.x-expected.x,walking.y-expected.y)<.02);
 const work=[.14,.36,.57,.81].map(t=>sampleSubday(worker,plan,(shift.arrive+(shift.returnStart-shift.arrive)*t)/24));
 for(const at of work){
  assert.equal(at.activity,'farm');
  assert.ok(Math.hypot(at.x-shift.to.x,at.y-shift.to.y)<=.19);
  assert.ok(walkable(s,at.x,at.y));
 }
 const xFixed=work.every(p=>Math.abs(p.x-shift.to.x)<1e-6);
 const yFixed=work.every(p=>Math.abs(p.y-shift.to.y)<1e-6);
 assert.ok(xFixed||yFixed,'a straight working furrow changes one coordinate only');
 assert.deepEqual(sampleSubday(worker,plan,(shift.end+.1)/24).activity,'home');
});

test('a stale job label without booked time does not manufacture a fictitious journey',()=>{
 const s=createWorld(413);
 const p=s.people.find(p=>p.alive&&p.age>=18);
 const h=s.households.find(h=>h.id===p.houseId);
 p.job='wood';p.x=h.x+4;p.y=h.y+3;delete p.dailyShift;
 const plan=planSubday(s);
 for(const t of [0,.25,.5,.75,1]){
  const at=sampleSubday(p,plan,t);
  assert.equal(at.activity,'home');
  assert.deepEqual({x:at.x,y:at.y},{x:h.x,y:h.y});
 }
});

test('real family footpaths are visible over planted, fallow and harvested fields, but not private crofts',()=>{
 const s=createWorld(413),stages=fieldAppearance(s);
 const h=s.households[0],field=h.fields[0],croft=h.croft[0];
 assert.equal(stages[field],1);
 s.traffic[field]=27;s.traffic[croft]=255;
 let lanes=trailAppearance(s,stages);
 assert.equal(lanes[field],1,'narrow footpath over fallow strip');
 assert.equal(lanes[croft],0,'enclosed garden cannot be a public road');
 s.traffic[field]=88;lanes=trailAppearance(s,stages);
 assert.equal(lanes[field],2,'busy field path grows but remains narrow');
 const dirt=s.usage.findIndex((u,i)=>!u&&s.terrain[i]===0);
 s.traffic[dirt]=88;lanes=trailAppearance(s,stages);
 assert.equal(lanes[dirt],3,'open road may become broader than field walk');
 const lake=s.terrain.findIndex(v=>v===1);
 s.traffic[lake]=255;assert.equal(trailAppearance(s,stages)[lake],0);
 const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 const cropDraw=app.indexOf('if(fieldStage){'),trailsDraw=app.indexOf('const trails=trailAppearance(sim,stages)');
 assert.ok(cropDraw>=0&&trailsDraw>cropDraw,'trails must be drawn in a separate overlay AFTER crops');
});

test('repeated actual field and forestry commutes wear a traversable route with no new resources',()=>{
 const s=createWorld(413),initialRoads=s.traffic.slice();
 advanceDays(s,150);
 const stages=fieldAppearance(s),trails=trailAppearance(s,stages);
 const landed=s.households.flatMap(h=>h.fields);
 const traversed=landed.filter(i=>trails[i]>0);
 const visible=trails.filter(x=>x>0).length;
 assert.ok(visible>20,'physical footsteps should create visible walking corridors');
 assert.ok(traversed.length>0,'some worn tracks must enter real cultivated land');
 assert.ok(s.traffic.some((n,i)=>n>initialRoads[i]),'work makes new footfall without pre-drawing roads');
 assert.ok(audit(s).ok,audit(s).issues.slice(0,5).join('; '));
 const snapshot=serialize(s),clone=deserialize(snapshot);
 const before=serialize(s);
 planSubday(s);trailAppearance(s);advanceFastView(makeFastView(),s,.025);
 assert.equal(serialize(s),before,'the renderer never simulates free foot traffic or changes property');
 advanceDays(s,60);advanceDays(clone,60);
 assert.equal(serialize(s),serialize(clone),'saved woodland/foot traffic history remains deterministic');
});

test('speed changes affect visual sampling, never the real paths, accounts or family timeline',()=>{
 const first=serialize(createWorld(7777));
 const cases=[
  [[1,400]],
  [[.25,400],[.5,100],[5,10],[20,10]]
 ];
 const outputs=cases.map(segments=>{
  const s=deserialize(first);let phase=0;
  for(const [speed,frames] of segments)for(let i=0;i<frames;i++){
   const step=integrateClock(phase,.05,speed);
   if(step.days)advanceDays(s,step.days);
   phase=step.phase;
   const v=planSubday(s);
   if(s.people[0]?.alive)sampleSubday(s.people[0],v,phase);
   trailAppearance(s);
  }
  assert.ok(audit(s).ok,audit(s).issues.slice(0,3).join('; '));
  return serialize(s);
 });
 assert.equal(outputs[0],outputs[1]);
});
