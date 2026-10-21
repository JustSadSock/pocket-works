import test from 'node:test';
import assert from 'node:assert/strict';
import {MAGES} from '../mages.mjs';
import {makeMatch,tick,STEP} from '../core.mjs';
import {directionalAim,courtAim,aimHeading,visualReticle} from '../aim-geometry.mjs';

const other={x:0,y:0,attack:false,shield:false,dash:false};
const near=(a,b)=>Math.abs(a-b)<1e-9;

test('mobile drag preserves the angle at court edges instead of clamping axes independently',()=>{
 const from={x:365,y:550};
 for(const [dx,dy] of [[1,0],[0,-1],[-1,1],[1,1],[-1,-1],[.02,1],[-1,.02]]){
  const target=directionalAim(from,dx,dy);
  assert.ok(near(Math.atan2(target.y-from.y,target.x-from.x),Math.atan2(dy,dx)));
  const sight=courtAim(from,dx,dy);
  assert.ok(sight.x>=0&&sight.x<=400&&sight.y>=0&&sight.y<=620);
  assert.ok(near(aimHeading(from,sight),aimHeading(from,target)));
 }
});
const form=s=>s.streams[0]||s.beams[0]||s.waves[0];
test('all signature attacks align precisely to cursor heading',()=>{
 const directions=[[1,0],[0,1],[-1,0],[0,-1],[3,-4],[-6,7],[.1,.9]];
 for(const m of MAGES){
  for(const [dx,dy] of directions){
   const s=makeMatch(426,m.id,'pebble'),a=s.actors[0];
   a.x=200;a.y=310;
   const target=directionalAim(a,dx,dy);
   tick(s,{x:0,y:0,attack:true,aim:target},STEP,other);
   const shots=s.shots.filter(q=>q.owner===0);
   const area=['cinder','coil','slate'].includes(m.id);
   assert.equal(shots.length,area?0:1,m.id+' must issue one signature attack');
   const fx=area?form(s):shots[0];
   assert.ok(fx,m.id+' missing real attack form');
   const angle=area?fx.angle:Math.atan2(fx.vy,fx.vx);
   assert.ok(near(angle,Math.atan2(dy,dx)),m.id+' inaccurate signature heading');
   assert.ok(near(aimHeading(a,target),a.face),m.id+' visual facing must follow attack');
   if(!area)assert.equal(fx.style,m.style);
  }
 }
});
test('multi-shot rune chains keep the same heading for all real projectiles',()=>{
 for(const m of MAGES){
  const s=makeMatch(48,m.id,'slate');s.actors[0].x=200;s.actors[0].y=310;
  s.actors[0].runes=['on_cast','ball','double','fastshot'];
  const aim=directionalAim(s.actors[0],-7,3);
  tick(s,{attack:true,aim},STEP,other);
  const shots=s.shots.filter(q=>q.owner===0);
  assert.equal(shots.length,['cinder','coil','slate'].includes(m.id)?2:3);
  for(const q of shots)assert.ok(near(Math.atan2(q.vy,q.vx),aimHeading(s.actors[0],aim)));
 }
});
