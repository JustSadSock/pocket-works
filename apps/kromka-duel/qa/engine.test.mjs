import test from 'node:test';
import assert from 'node:assert/strict';
import {FIELD,STEP,NO_INPUT,createDuel,tick,inputOf,spawn,tip,aiInput,copyDuel,shieldOf,bladeOf} from '../engine.js';

const empty=()=>({...NO_INPUT});
test('input validation rejects impossible movement and preserves idempotent canonical controls',()=>{
 assert.equal(inputOf({mx:2,my:0,ax:0,ay:1}),null);
 assert.equal(inputOf({mx:Infinity,my:0,ax:0,ay:1}),null);
 assert.equal(inputOf({mx:'1',my:0,ax:0,ay:1}),null);
 for(let k=0;k<300;k++){
  const a=inputOf({mx:Math.sin(k*.371),my:Math.cos(k*.25),ax:Math.cos(k*.17),ay:Math.sin(k*.79)});
  assert.deepEqual(inputOf(a),a);
 }
});
test('idle opponents do not automatically hit each other',()=>{
 const s=createDuel();
 for(let i=0;i<100;i++)tick(s,[empty(),{...empty(),ay:1}],STEP);
 assert.deepEqual(s.scores,[0,0]);
 assert.equal(s.event,null);
 assert.equal(s.phase,'battle');
});
function direct(guard){
 const s=createDuel();
 s.fighters[0].x=180;s.fighters[0].y=319;s.fighters[0].a=-Math.PI/2;
 s.fighters[1].x=180;s.fighters[1].y=258;s.fighters[1].a=Math.PI/2;
 for(let i=0;i<16;i++)tick(s,[
  {...empty(),jab:i===0},
  {...empty(),ay:1,parry:guard&&i===0}
 ],STEP);
 return s;
}
test('an aimed rapier lands one point, without random damage',()=>{
 const s=direct(false);
 assert.deepEqual(s.scores,[1,0]);
 assert.equal(s.event.type,'point');
 assert.equal(s.event.who,0);
});
test('timely facing parry intercepts a thrust and creates a riposte window',()=>{
 const s=direct(true);
 assert.deepEqual(s.scores,[0,0]);
 assert.equal(s.event.type,'parry');
 assert.ok(s.fighters[1].riposte>0);
 assert.ok(s.fighters[0].stagger>0);
});
test('side-step dash grants brief evasion and has cooldown',()=>{
 const s=createDuel();
 tick(s,[{...empty(),mx:1,dash:true},{...empty(),ay:1}],STEP);
 assert.ok(s.fighters[0].dash>0);
 assert.ok(s.fighters[0].dashCd>.5);
 assert.ok(s.fighters[0].immunity>0);
 const cd=s.fighters[0].dashCd;
 tick(s,[{...empty(),mx:1,dash:true},{...empty(),ay:1}],STEP);
 assert.ok(s.fighters[0].dashCd<cd);
});
test('10000 deterministic frames remain finite and constrained to the oval arena',()=>{
 const s=createDuel();s.roundTime=999;
 for(let i=0;i<10000;i++){
  const actor=inputOf({mx:Math.sin(i*.137),my:Math.cos(i*.3),ax:Math.sin(i*.08),ay:-Math.cos(i*.08),
    jab:i%33===0,parry:i%117===0,dash:i%142===0});
  const rival=aiInput(s,1);
  tick(s,[actor,rival],STEP);
  for(const f of s.fighters){
   assert.ok([f.x,f.y,f.a,f.vx,f.vy].every(Number.isFinite));
   const v=Math.hypot((f.x-FIELD.cx)/FIELD.rx,(f.y-FIELD.cy)/FIELD.ry);
   assert.ok(v<=.914);
   assert.ok(Object.values(tip(f)).every(Number.isFinite));
  }
  if(s.phase==='finished')break;
 }
});
test('no rendering input can mutate an authoritative duel snapshot',()=>{
 const s=createDuel(),c=copyDuel(s);
 c.fighters[0].x+=80;c.scores[0]++;
 assert.notDeepEqual(s,c);
 assert.equal(s.scores[0],0);
});

function fencingLine(defending=false,perfectParry=false){
 const s=createDuel(),attacker=s.fighters[0],defender=s.fighters[1];
 attacker.x=180;attacker.y=319;attacker.a=-Math.PI/2;
 defender.x=180;defender.y=258;defender.a=Math.PI/2;
 attacker.sx=194;attacker.sy=302;defender.sx=166;defender.sy=275;
 const kinds=[];
 let eventId=0;
 for(let i=0;i<25;i++){
  tick(s,[{...empty(),jab:i===0},{...empty(),ay:1,guard:defending,parry:perfectParry&&i===0}],STEP);
  if(s.event?.id!==eventId){eventId=s.event.id;kinds.push(s.event.type);}
 }
 return {s,kinds};
}

test('passive sword contact physically deflects but does not give invulnerability',()=>{
 const {s,kinds}=fencingLine();
 assert.ok(kinds.includes('bind'),'weapons must touch');
 assert.ok(kinds.includes('point'),'unguarded fighter must remain vulnerable');
 assert.deepEqual(s.scores,[1,0]);
});

test('held buckler covers frontal line and prevents a valid thrust',()=>{
 const {s,kinds}=fencingLine(true);
 assert.ok(kinds.includes('shield'),'active guard must cause an actual physical shield impact');
 assert.deepEqual(s.scores,[0,0]);
 assert.ok(s.fighters[1].shieldFlash>=0);
});

test('timed parry still opens riposte independently of shield',()=>{
 const {s,kinds}=fencingLine(false,true);
 assert.deepEqual(s.scores,[0,0]);
 assert.ok(kinds.includes('parry'));
});

test('shield remains body-tethered with bounded inertia while dashing and turning',()=>{
 const s=createDuel();
 let moved=false;let old=shieldOf(s.fighters[0]);
 for(let i=0;i<250;i++){
  const v=inputOf({mx:Math.sin(i*.13),my:Math.cos(i*.21),ax:Math.sin(i*.09),ay:-Math.cos(i*.09),
    guard:i%70<40,dash:i===0||i===150});
  tick(s,[v,{...empty(),ay:1}],STEP);
  const f=s.fighters[0],sh=shieldOf(f),ahead=f.guard?24:17,toSide=f.guard?9:14;
  const anchorX=f.x+Math.cos(f.a)*ahead-Math.sin(f.a)*toSide;
  const anchorY=f.y+Math.sin(f.a)*ahead+Math.cos(f.a)*toSide;
  assert.ok(Math.hypot(sh.x-anchorX,sh.y-anchorY)<6.53,'buckler detached from shoulder');
  assert.ok([sh.x,sh.y,sh.r,sh.angle,f.bladeKick].every(Number.isFinite));
  if(Math.hypot(old.x-sh.x,old.y-sh.y)>1)moved=true;
  old=sh;
 }
 assert.ok(moved,'off-hand should physically respond to movement');
});

test('shield is directional; side and rear openings are not global invulnerability',()=>{
 const s=createDuel();
 const f=s.fighters[1];
 f.guard=true;f.a=Math.PI/2;
 const front=shieldOf(f);
 assert.equal(front.r,16);
 assert.ok(Math.hypot(front.x-f.x,front.y-f.y)<35);
});
