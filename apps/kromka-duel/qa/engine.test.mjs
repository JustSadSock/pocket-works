import test from 'node:test';
import assert from 'node:assert/strict';
import {FIELD,STEP,NO_INPUT,createDuel,tick,inputOf,spawn,tip,aiInput,copyDuel} from '../engine.js';

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
