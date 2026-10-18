import test from 'node:test';
import assert from 'node:assert/strict';
import { MarblePhysics } from './physics.js';
import {
  MARBLE_RADIUS, WELL_DEPTH, GOAL_CAPTURE_MS, identityRotation,
  normalizedQuaternion, rollQuaternion, marbleModelMatrix,
  startGoalCapture, sampleGoalCapture
} from './marble-motion.js';
import { makeFrameWithOpening, makeWell } from './render-geometry.js';

const approx=(actual,expected,eps=1e-5)=>{
  assert.ok(Math.abs(actual-expected)<eps,`${actual} should be approximately ${expected}`);
};

test('no-slip quaternion roll uses actual distance and remains a unit rotation',()=>{
  let q=identityRotation();
  q=rollQuaternion(q,Math.PI*MARBLE_RADIUS,0,MARBLE_RADIUS);
  approx(Math.hypot(...q),1);
  // +X movement rotates around world +Z by pi.
  approx(q[2],1);
  approx(q[3],0);
  const reversed=rollQuaternion(q,-Math.PI*MARBLE_RADIUS,0,MARBLE_RADIUS);
  approx(Math.abs(reversed[3]),1);
  approx(Math.hypot(reversed[0],reversed[1],reversed[2]),0);
  assert.deepEqual(rollQuaternion(q,0,0,MARBLE_RADIUS),q);
});

test('quaternion transforms rotate the marble while keeping a fixed center and radius',()=>{
  const q=rollQuaternion(identityRotation(),0.2,0.1,MARBLE_RADIUS);
  const transform=marbleModelMatrix({x:1.5,y:MARBLE_RADIUS,z:2.5},q);
  assert.equal(transform.length,16);
  approx(transform[12],1.5);
  approx(transform[13],MARBLE_RADIUS);
  approx(transform[14],2.5);
  for(let axis=0;axis<3;axis++){
    approx(Math.hypot(transform[axis],transform[4+axis],transform[8+axis]),1,1e-5);
  }
  assert.deepEqual(normalizedQuaternion([0,0,0,0]),identityRotation());
});

test('wall-resolved displacement drives marble orientation, reset clears kinetic state',()=>{
  const ball=new MarblePhysics();
  ball.reset({x:0.5,y:0.5});
  const empty={walls:[]};
  for(let i=0;i<20;i++) ball.update(1/60,{x:1,y:0},empty);
  assert.ok(ball.position.x>0.5);
  approx(Math.hypot(...ball.orientation),1,1e-5);
  assert.ok(Math.abs(ball.orientation[2])>0.01,'orientation visibly changes');
  ball.reset({x:0.5,y:0.5});
  assert.deepEqual(ball.orientation,identityRotation());
  approx(ball.spin,0);
  approx(ball.impact,0);
});

test('goal capture is a deterministic uninterrupted descent with results delayed',()=>{
  assert.ok(GOAL_CAPTURE_MS>=900);
  const ball=new MarblePhysics();
  ball.position={x:5.28,y:7.55};
  ball.velocity={x:1.4,y:-0.5};
  ball.orientation=rollQuaternion(identityRotation(),.13,.04,ball.radius);
  const origin=structuredClone(ball.position);
  const cap=startGoalCapture(ball,{x:5.5,y:7.5});
  const samples=[0,.1,.28,.5,.7,.87,1].map(t=>sampleGoalCapture(cap,t));
  assert.equal(samples[0].phase,'rim');
  assert.equal(samples[3].phase,'fall');
  assert.equal(samples[6].phase,'settle');
  assert.ok(samples[0].position.y>samples[4].position.y);
  approx(samples[2].position.x,5.5);
  approx(samples[2].position.z,7.5);
  approx(samples[6].position.y,ball.radius-WELL_DEPTH);
  assert.equal(samples[5].done,false);
  assert.equal(samples[6].done,true);
  assert.deepEqual(ball.position,origin,'animation never mutates the physics body');
  approx(Math.hypot(...samples[3].rotation),1);
});

test('actual shaft and plinth have room for the whole falling sphere',()=>{
  const depth=makeWell(5.5,7.5);
  const y=[];
  for(let i=1;i<depth.positions.length;i+=3) y.push(depth.positions[i]);
  approx(Math.min(...y),-WELL_DEPTH);
  const blocks=makeFrameWithOpening(7,10,{x:5.5,y:7.5});
  assert.equal(blocks.length,4);
  for(const block of blocks){
    const xs=[],zs=[];
    for(let i=0;i<block.positions.length;i+=3){
      xs.push(block.positions[i]); zs.push(block.positions[i+2]);
    }
    const includesCenter=(Math.min(...xs)<5.5&&Math.max(...xs)>5.5
      &&Math.min(...zs)<7.5&&Math.max(...zs)>7.5);
    assert.equal(includesCenter,false,'frame cannot intersect the goal shaft');
  }
});
