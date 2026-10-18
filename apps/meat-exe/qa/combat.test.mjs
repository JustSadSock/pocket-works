import test from 'node:test';
import assert from 'node:assert/strict';
import {directionFromAim,pelletAim,hitRay,staggerDuration} from '../combat.js';
const player={x:0,y:1.41,z:0};
const forward=directionFromAim(0,0),walk=()=>true;
test('bolter aims straight through its center, not random spread',()=>{
  assert.deepEqual(pelletAim(0,.12,0,1,.1),directionFromAim(0,.12));
  assert.deepEqual(pelletAim(0,0,0,7,.15),directionFromAim(0,0));
});
test('shotgun pellets form repeatable bounded radial pattern',()=>{
  const a=Array.from({length:7},(_,i)=>pelletAim(.2,0,i,7,.15));
  const b=Array.from({length:7},(_,i)=>pelletAim(.2,0,i,7,.15));
  assert.deepEqual(a,b);assert.ok(a.slice(1).some(d=>Math.abs(d.x-a[0].x)>.03));
  for(const p of a) assert.ok(Math.abs(Math.hypot(p.x,p.y,p.z)-1)<1e-7);
});
test('enemy in direct open line receives a ray hit',()=>{
 const e={type:'crawler',hp:25,x:0,z:-4},hit=hitRay(player,forward,[e],walk);
 assert.equal(hit.kind,'flesh');assert.equal(hit.enemy,e);assert.ok(hit.distance>3&&hit.distance<4);
});
test('walls always occlude enemies even if center is visible through a corner',()=>{
 const blocked=(x,z)=>z> -2.5;
 const behind={type:'crawler',hp:25,x:0,z:-4},hit=hitRay(player,forward,[behind],blocked);
 assert.equal(hit.kind,'wall');assert.equal(hit.enemy,null);assert.ok(hit.distance<3);
});
test('nearest enemy wins, and geometry blocks more distant enemies',()=>{
 const near={type:'crawler',hp:61,x:0,z:-2},far={type:'heart',hp:310,x:0,z:-4};
 assert.equal(hitRay(player,forward,[far,near],walk).enemy,near);
});
test('floor, roof and walls stop steep shots, no hit through anatomy',()=>{
 const up=hitRay(player,{x:0,y:1,z:-.1},[],walk),down=hitRay(player,{x:0,y:-1,z:0},[],walk);
 assert.equal(up.kind,'wall');assert.equal(down.kind,'wall');
 assert.ok(up.point.y<=2.7&&down.point.y>=.07);
});
test('shots can miss, finite return point and intensity by enemy type',()=>{
 const hit=hitRay(player,forward,[],walk,7);
 assert.equal(hit.kind,'miss');assert.equal(hit.distance,7);assert.equal(hit.point.z,-7);
 assert.ok(staggerDuration('crawler')>staggerDuration('heart'));
});
