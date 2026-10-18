import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ROBOTS,describeMove,bumpMotion,poseFor,robotMood} from './actors.js';
const start=[{x:1,y:3},{x:5,y:3}],finish=[{x:2,y:3},{x:5,y:3}];
test('characters keep distinct names and readable axis identities',()=>{
 assert.equal(ROBOTS.length,2);
 assert.deepEqual(ROBOTS.map(r=>r.axis),['Y','X']);
 assert.notEqual(ROBOTS[0].shell,ROBOTS[1].shell);
});
test('movement tracks the blocked character independently',()=>{
 const m=describeMove(start,finish,1000,'right');
 assert.deepEqual(m.blocked,[false,true]);
 assert.deepEqual(m.to,finish);
 assert.equal(m.dx,1);assert.equal(m.dy,0);
 assert.ok(poseFor(m,0,1165).x>1);
 assert.equal(poseFor(m,1,1310).x,5);
 assert.ok(poseFor(m,1,1150).impact>0);
 assert.equal(poseFor(m,0,1310).x,2);
 // The renderer may move visually; source state must remain unchanged.
 assert.deepEqual(start,[{x:1,y:3},{x:5,y:3}]);
});
test('full wall rejection compresses both robots then fully settles',()=>{
 const m=bumpMotion(start,1000,'up');
 assert.deepEqual(m.blocked,[true,true]);
 const mid=poseFor(m,0,1120);
 assert.ok(mid.impact>.5);
 assert.ok(mid.y>start[0].y);
 const end=poseFor(m,0,1400);
 assert.equal(end.x,start[0].x);
 assert.equal(end.y,start[0].y);
 assert.equal(end.impact,0);
});
test('reduced motion skips displacement and keeps static goal expression',()=>{
 const m=describeMove(start,finish,1000,'right');
 assert.equal(poseFor(m,0,1010,true).x,2);
 assert.equal(poseFor(m,1,1150,true).impact,0);
 assert.equal(robotMood({win:true,reduced:true}),'celebrate');
 assert.equal(robotMood({onGoal:true,reduced:true}),'pleased');
});
test('facial priorities represent impact over ordinary walking',()=>{
 assert.equal(robotMood({impact:.9,travelling:true}),'squint');
 assert.equal(robotMood({travelling:true}),'focused');
 assert.equal(robotMood({win:true,impact:.99}),'celebrate');
 assert.equal(describeMove(start,start,1234,'up'),null);
});
