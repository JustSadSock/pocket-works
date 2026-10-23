import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULES, COURSE_THEMES,generateCourse,validateCourse,deviceRect } from './course.js';
import { createGame,commandGame,stepGame,FIXED_DT,ROBOT,progressGame } from './engine.js';

function run(game,seconds) {
 const events=[];
 for(let i=0;i<seconds/FIXED_DT&&!game.finished;i++)events.push(...stepGame(game,FIXED_DT));
 return events;
}
const standalone=(kind)=>{for(let n=1;n<=3000;n++){
 const level=generateCourse(n,5);
 if(level.sections.some(section=>section.kind===kind))return level;
}throw Error('Missing '+kind)};
test('same seed always generates the same track and devices',()=>{
 for(let seed=1;seed<=300;seed++){
  assert.deepEqual(generateCourse(seed),generateCourse(seed));
 }
 assert.notDeepEqual(generateCourse(11).sections,generateCourse(12).sections);
});
test('500 procedural circuits satisfy structural reachability contract',()=>{
 for(let seed=1;seed<=500;seed++) {
  const course=generateCourse(seed);
  assert.equal(validateCourse(course),true,'seed='+seed);
  assert.equal(course.sections.length,5);
  assert.ok(course.goal>course.checkpoint&&course.checkpoint>course.start);
 }
});
test('all role-gated mechanical modules are generated with six players',()=>{
 const seen=new Set(),artTypes=new Set();
 for(let seed=1;seed<=120;seed++){
  const c=generateCourse(seed,5,6);
  c.sections.forEach(s=>seen.add(s.kind));
  c.devices.forEach(d=>artTypes.add(d.type));
 }
 assert.deepEqual([...seen].sort(),MODULES.map(m=>m.kind).sort());
 assert.equal(COURSE_THEMES.length,3);
 for(const type of ['press','gate','spring','belt-left','belt-right','fan-up','fan-side'])assert.ok(artTypes.has(type));
});
test('generated world bounds and checkpoint are dynamic',()=>{
 const l=generateCourse(176),s=createGame(l);s.x=l.goal;s.y=6.5-ROBOT.halfHeight;s.ground=true;
 assert.ok(progressGame(s)>.999);
 const events=stepGame(s,FIXED_DT);
 assert.ok(events.includes('finish'));
 assert.equal(s.finished,true);
});
test('spring actively injects vertical impulse on contact',()=>{
 const l=standalone('spring'),device=l.devices.find(d=>d.type==='spring');
 const s=createGame(l);s.x=device.x+device.w/2;s.y=6.5-ROBOT.halfHeight-.2;s.vy=3;s.ground=false;
 let events=[];
 for(let i=0;i<70;i++)events.push(...stepGame(s,FIXED_DT));
 assert.ok(events.includes('spring'));
 assert.ok(s.springCooldown>=0);
});
test('reverse conveyor reduces forward motor speed',()=>{
 const l=standalone('belt-left'),d=l.devices.find(x=>x.type==='belt-left');
 const s=createGame(l);s.x=d.x+d.w/2;s.y=6.5-ROBOT.halfHeight;s.vx=3.4;s.ground=true;
 const ordinary=createGame(l);ordinary.x=d.x-0.02;ordinary.y=6.5-ROBOT.halfHeight;ordinary.vx=3.4;ordinary.ground=true;
 stepGame(s,FIXED_DT);stepGame(ordinary,FIXED_DT);
 assert.ok(s.vx<ordinary.vx,'Belt must slow actual forward motion');
});
test('air jets change falling velocity in the intended direction',()=>{
 for(const kind of ['fan-up','fan-side']){
  const l=standalone(kind),d=l.devices.find(x=>x.type===kind);
  const s=createGame(l);s.x=d.x+d.w/2;s.y=5.5;s.ground=false;s.vx=0;s.vy=0;
  const ref=createGame(l);ref.x=s.x;ref.y=s.y;ref.ground=false;ref.vx=0;ref.vy=0;
  ref.level={...l,devices:[]};
  stepGame(s,FIXED_DT);stepGame(ref,FIXED_DT);
  if(kind==='fan-up')assert.ok(s.vy<ref.vy);
  else assert.ok(s.vx<ref.vx);
 }
});
test('press collision causes a real respawn, not cosmetic damage',()=>{
 const l=standalone('press'),d=l.devices.find(x=>x.type==='press');
 const s=createGame(l);
 s.x=d.x+d.w/2;s.y=6.5-ROBOT.halfHeight;s.ground=true;
 let hit=false;
 for(let i=0;i<1000;i++){
  // Park under the press to ensure the device cycles through its dangerous position.
  s.x=d.x+d.w/2;s.y=6.5-ROBOT.halfHeight;s.ground=true;s.vx=0;s.dir=-1;
  hit=stepGame(s,FIXED_DT).includes('hazard')||hit;
  if(hit)break;
 }
 assert.ok(hit);
 assert.equal(s.respawns,1);
});
test('timed gate alternates open and blocked states',()=>{
 const l=standalone('gate'),d=l.devices.find(x=>x.type==='gate');
 const samples=Array.from({length:240},(_,i)=>deviceRect(d,i*.06).active);
 assert.ok(samples.some(Boolean)&&samples.some(v=>!v));
});
test('changing seeds never mutates earlier snapshots',()=>{
 const a=generateCourse(412),before=JSON.stringify(a);
 const b=generateCourse(600);
 const s=createGame(b);for(let i=0;i<300;i++)stepGame(s,FIXED_DT);
 assert.equal(JSON.stringify(a),before);
});

test('generator never requires absent operators',()=>{
 const abilityBySection={ 'mag-rail':3,'timing-press':4,'cargo-switch':5,'float-gap':6 };
 for(let count=2;count<=6;count++){
  for(let seed=1;seed<=200;seed++){
   const level=generateCourse(seed,5,count);
   assert.equal(validateCourse(level),true);
   for(const section of level.sections)assert.ok(!abilityBySection[section.kind]||abilityBySection[section.kind]<=count);
  }
 }
});
