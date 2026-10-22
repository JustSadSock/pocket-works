import test from 'node:test';
import assert from 'node:assert/strict';
import {stepBall,traceShot,createBall,constrainPoint,validPoint,shotVelocity,safeWorld} from '../physics.mjs';
const base={shape:'rectangle',origin:{x:100,y:250},target:{x:700,y:250},segments:[],bumpers:[],gravity:0,friction:0,restitution:1};
test('horizontal ballistic shot reaches sensor',()=>{
 const result=traceShot(base,0,75);
 assert.equal(result.hit,true);assert.equal(result.bounces,0);assert.ok(result.time>0);
});
test('rectangular rail reflects normal component',()=>{
 const result=stepBall(createBall(856,270,600,40),base,1/100);
 assert.ok(result.ball.vx<0);assert.ok(result.ball.vy>0);assert.equal(result.bounces,1);
});
test('round table mirrors radial velocity',()=>{
 const result=stepBall(createBall(662,270,600,0),{...base,shape:'circle'},1/100);
 assert.ok(result.ball.vx<0);assert.ok(validPoint('circle',result.ball,9));
});
test('static bumper reflects rather than tunnels',()=>{
 const result=stepBall(createBall(415,270,700,0),{...base,bumpers:[{x:450,y:270}]},1/100);
 assert.ok(result.ball.vx<0);assert.equal(result.bounces,1);
});
test('triangle clamp stays inside all sides',()=>{
 for(const p of [{x:20,y:20},{x:880,y:490},{x:450,y:530}]) assert.ok(validPoint('triangle',constrainPoint('triangle',p),9.9));
});
test('the reflection constraint changes target completion',()=>{
 const free=traceShot(base,0,75);
 const required=traceShot({...base,requiredBounces:1},0,75);
 assert.equal(free.hit,true);assert.equal(required.hit,true);assert.ok(required.bounces>=1);assert.ok(required.time>free.time);
});
test('stored state is sanitized',()=>{
 const world=safeWorld({shape:'unknown',origin:{x:-999,y:30},bumpers:Array.from({length:50},()=>({x:400,y:220})),restitution:20,segments:[{x1:1,y1:1,x2:5,y2:5}]});
 assert.equal(world.shape,'rectangle');assert.equal(world.bumpers.length,25);assert.equal(world.segments.length,0);assert.equal(world.restitution,1);
});
test('launch velocity follows angle',()=>{
 const shot=shotVelocity(90,50);
 assert.ok(Math.abs(shot.vx)<1e-10);assert.ok(shot.vy>0);
});
