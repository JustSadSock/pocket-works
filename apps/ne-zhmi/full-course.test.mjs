import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCourse,deviceRect,validateCourse} from './course.js';
import {createGame,stepGame,commandGame,FIXED_DT,ROBOT} from './engine.js';

const clone=s=>JSON.parse(JSON.stringify(s));
const jumpTargets={
 gap:[.36,.51,.66,.80,.92],
 'double-gap':[.32,.52,.72],
 step:[.30,.47,.63,.78],
 islands:[.28,.49,.71,.96],
 'mag-rail':[.32,.50,.65],
 'float-gap':[.25,.40,.60]
};

// Every action goes through the exact production command and fixed physics.
// Candidate branching copies a legitimate prior game state; it NEVER directly
// sets robot x/y, energy, timer, collision status, goal, or checkpoint.
function playSection(original,section,crew,jumpAt,waitUntil,fieldEnd){
 const state=clone(original);
 const initialTime=state.t;
 let jumped=false;
 for(let frame=0;frame<11/FIXED_DT&&!state.finished;frame++){
  const position=state.x-section.x;
  if(jumpAt>=0&&!jumped&&position>=jumpAt&&position<jumpAt+.24&&state.ground){
   commandGame(state,'jump');jumped=true;
  }
  commandGame(state,'magnet',section.kind==='mag-rail'&&position>.27&&position<fieldEnd&&!state.ground);
  commandGame(state,'float',section.kind==='float-gap'&&position>.28&&position<fieldEnd&&!state.ground);
  const ready=section.kind==='cargo-switch'&&!state.cargo.some(c=>c.latched);
  if(ready&&state.pushCooldown<=0&&position>.2&&position<3.65)commandGame(state,'push');
  const brake=crew>=4&&['timing-press','press'].includes(section.kind)
    &&position>.40&&state.t-initialTime<waitUntil;
  commandGame(state,'brake',brake);
  const before=state.respawns;
  stepGame(state,FIXED_DT);
  if(state.respawns!==before)return null;
  if(state.x>=section.x+section.w-.22 &&
    (section.kind!=='cargo-switch'||state.cargo.some(c=>c.latched)))return state;
 }
 return null;
}
export function solveFullTrack(level){
 let frontier=[createGame(level)],segments=0;
 for(const section of level.sections){
  const next=[];
  const jumps=jumpTargets[section.kind]||[-1];
  const waits=['timing-press','press'].includes(section.kind)&&level.playerCount>=4
    ?[.25,.4,.6,.85,1.2,1.5]:[0];
  const endValues=['float-gap','mag-rail'].includes(section.kind)?[2.2,2.8,3.35,4.15]:[4.4];
  for(const state of frontier)
   for(const jump of jumps)
    for(const wait of waits)
     for(const end of endValues){
      const result=playSection(state,section,level.playerCount,jump,wait,end);
      if(result)next.push(result);
     }
  next.sort((a,b)=>a.t-b.t);
  frontier=[];
  for(const candidate of next){
   if(frontier.length>=7)break;
   if(!frontier.some(s=>Math.abs(s.t-candidate.t)<.27&&Math.abs(s.y-candidate.y)<.45))
    frontier.push(candidate);
  }
  if(!frontier.length)return {success:false,segments,blocked:section.kind};
  segments++;
 }
 for(const raw of frontier){
  const state=clone(raw);
  commandGame(state,'magnet',false);
  commandGame(state,'float',false);
  commandGame(state,'brake',false);
  for(let i=0;i<350&&!state.finished;i++)stepGame(state,FIXED_DT);
  if(state.finished)return {success:true,segments,time:state.wonAt,falls:state.respawns,
    jumps:state.jumps,magnetUses:state.magnetUses,pushes:state.pushes};
 }
 return {success:false,segments,blocked:'finish'};
}

test('every chosen 4–6-section course can be constructed without adjacent airborne traps',()=>{
 const heavy=new Set(['gap','double-gap','step','islands','mag-rail','float-gap']);
 for(let crew=2;crew<=6;crew++)
  for(let length=4;length<=6;length++)
   for(let seed=1;seed<=600;seed++){
    const course=generateCourse(seed,length,crew);
    assert.ok(validateCourse(course));
    assert.equal(course.version,4);
    for(let i=1;i<course.sections.length;i++){
     const prev=course.sections[i-1].kind,kind=course.sections[i].kind;
     assert.ok(!(heavy.has(kind)&&heavy.has(prev)),crew+'/'+length+'/'+seed);
     assert.ok(!(heavy.has(kind)&&['spring','fan-up'].includes(prev)),
      'airborne-to-jump trap '+crew+'/'+length+'/'+seed);
    }
   }
});

test('complete run uses actual physics from start to FINISH, never teleports between modules',()=>{
 const stats=[];
 for(let crew=2;crew<=6;crew++){
  let won=0,failed=[];
  for(let seed=1;seed<=18;seed++){
   const level=generateCourse(seed,5,crew);
   const result=solveFullTrack(level);
   if(result.success){
    assert.equal(result.segments,5);
    assert.equal(result.falls,0);
    assert.ok(result.time>3&&result.time<80);
    won++;
   }else failed.push({seed,blocked:result.blocked,segments:result.segments});
  }
  stats.push({crew,won,attempts:18,failed:failed.slice(0,5)});
  assert.ok(won>=11,'Full-course verified rate insufficient: '+JSON.stringify(stats.at(-1)));
 }
 const overall=stats.reduce((sum,entry)=>sum+entry.won,0);
 console.log('FULL COURSE PHYSICAL RUNS:',JSON.stringify(stats));
 assert.ok(overall>=68,'At least 68 of 90 complete end-to-end test routes must finish');
});

test('charged brake protects on release only after a deliberate stop',()=>{
 const level={start:1.15,goal:14,checkpoint:7,width:18,
  platforms:[{x:0,y:6.5,w:18,h:1.5}],
  devices:[{type:'press',x:5,w:.7,phase:0}]};
 const state=createGame(level);
 commandGame(state,'brake',true);
 for(let i=0;i<35;i++)stepGame(state,FIXED_DT);
 assert.ok(state.brakeCharge>=.22);
 commandGame(state,'brake',false);
 assert.ok(state.brakeGuard>1);
 state.x=5.2;state.y=6.04;state.ground=true;
 let hitTime=0;
 for(let t=.05;t<4;t+=.01){
  const hit=deviceRect(level.devices[0],t);
  if(hit.y+hit.h>5.58&&hit.y<6.5){hitTime=t;break;}
 }
 assert.ok(hitTime>0);
 state.t=hitTime;
 const falls=state.respawns;
 assert.ok(!stepGame(state,FIXED_DT).includes('hazard'));
 assert.equal(state.respawns,falls);
 const tap=createGame(level);
 commandGame(tap,'brake',true);commandGame(tap,'brake',false);
 assert.equal(tap.brakeGuard,0);
 tap.t=hitTime;tap.x=5.2;tap.y=6.04;tap.ground=true;
 assert.ok(stepGame(tap,FIXED_DT).includes('hazard'),'an uncharged tap never grants protection');
});

test('magnetic lift obeys physical rail limits; an airborne pulse can reach cargo',()=>{
 const level={start:1.15,goal:16,checkpoint:8,width:20,
  platforms:[{x:0,y:6.5,w:20,h:1.5}],
  devices:[{type:'mag-rail',x:5,w:1.5,y:3.65},{type:'cargo',x:12,w:.48,padX:14}]};
 const g=createGame(level);
 g.x=8;g.y=4.7;g.ground=false;g.vy=0;
 commandGame(g,'magnet',true);
 stepGame(g,FIXED_DT);
 assert.ok(g.vy>0,'Outside the rail, gravity must pull the robot downward');
 const box=createGame(level);
 box.x=10.5;box.y=3.7;box.ground=false;
 commandGame(box,'push');
 assert.ok(box.cargo[0].vx>0,'shockwave must move cargo while crossing overhead');
});
