import test from 'node:test';
import assert from 'node:assert/strict';
import {MODULES,generateCourse,validateCourse} from './course.js';
import {createGame,commandGame,stepGame,FIXED_DT} from './engine.js';
import module,{generateCourse as serverCourse} from './server/module.ts';

const need={3:'mag-rail',4:'timing-press',5:'cargo-switch',6:'float-gap'};
const major=new Set(['gap','double-gap','step','islands','mag-rail','float-gap']);

test('each operator in a crew of 3–6 receives an actual mechanical section',()=>{
 for(let count=2;count<=6;count++)for(let sections=4;sections<=6;sections++)
  for(let seed=1;seed<=1000;seed++){
   const level=generateCourse(seed,sections,count);
   assert.ok(validateCourse(level),'geometry '+count+'/'+sections+'/'+seed);
   assert.equal(level.sections.length,sections);
   assert.equal(level.version,3);
   for(let role=3;role<=count;role++)
    assert.equal(level.sections.filter(s=>s.kind===need[role]).length,1,
     'missing specialist '+role+' for '+count+'/'+sections+'/'+seed);
   assert.equal(new Set(level.sections.map(s=>s.kind)).size,sections);
   for(let i=1;i<sections;i++)
    assert.ok(!(major.has(level.sections[i].kind)&&major.has(level.sections[i-1].kind)),
      'unsafe adjacent jumps '+count+'/'+sections+'/'+seed);
  }
});
test('generator output matches authoritative PocketNet v15 across crew sizes and seeds',()=>{
 for(let count=2;count<=6;count++)for(let sections=4;sections<=6;sections++)
  for(let seed=1;seed<=80;seed++)
   assert.deepEqual(serverCourse(seed,sections,count),generateCourse(seed,sections,count));
});
test('each distinct section type can be physically traversed with genuine controls',()=>{
 const sample=new Map();
 for(let crew=2;crew<=6;crew++){
  for(let seed=1;seed<=80;seed++){
   const level=generateCourse(seed,5,crew);
   for(const sec of level.sections)
    if(!sample.has(sec.kind))sample.set(sec.kind,{level,sec,crew});
  }
 }
 assert.deepEqual([...sample.keys()].sort(),MODULES.map(m=>m.kind).sort());
 const allowedTargets=[-1,.08,.2,.4,.6,.8,1,1.2,1.5,1.8,2.3,2.7,3.2];
 for(const mod of MODULES){
  const {level,sec}=sample.get(mod.kind);
  let solved=false;
  for(const jumpAt of allowedTargets){
   if(solved)break;
   for(const startT of [0,1.3,2.6,3.9]){
    const g=createGame(level);
    g.x=sec.x+.12;g.checkpoint=g.x;g.y=6.04;g.ground=true;g.dir=1;g.t=startT;
    let lastJump=-1000,used=false;
    for(let tick=0;tick<12/FIXED_DT&&g.respawns<=2;tick++){
     const pos=g.x-sec.x;
     if(jumpAt>=0&&pos>=jumpAt&&tick-lastJump>55&&g.ground&&pos<4.2){
      commandGame(g,'jump');lastJump=tick;
     }
     if(mod.kind==='float-gap'){
      commandGame(g,'float',pos>.25&&pos<4.2&&!g.ground);
      if(g.held.float)used=true;
     }
     if(mod.kind==='mag-rail'){
      commandGame(g,'magnet',pos>.4&&pos<4.15&&!g.ground);
      if(g.held.magnet)used=true;
     }
     if(mod.kind==='timing-press'){
      commandGame(g,'brake',pos>1.1&&pos<1.5);
      if(g.held.brake)used=true;
     }
     if(mod.kind==='cargo-switch'&&g.pushCooldown<.01&&pos>.45&&pos<3.6){
      commandGame(g,'push');used=true;
     }
     stepGame(g,FIXED_DT);
     if(g.x>sec.x+4.4&&g.ground){
      const latched=mod.kind!=='cargo-switch'||g.cargo.some(x=>x.latched);
      if(latched&&(!mod.required||used))solved=true;
      break;
     }
    }
    if(solved)break;
   }
  }
  assert.equal(solved,true,mod.kind+' has no demonstrated physical passage');
 }
});
test('six operators never receive repeated specialty or isolated unplayable geometry',()=>{
 const count=6;
 for(let seed=1;seed<=500;seed++){
  const level=generateCourse(seed,4,count);
  assert.equal(level.sections.length,4);
  assert.deepEqual(level.sections.map(s=>s.kind).sort(),Object.values(need).sort());
  assert.ok(level.sections.every((s,i)=>i>0||!['timing-press','cargo-switch'].includes(s.kind)));
 }
});
