import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceDeckMotion} from './deck-motion.js';

const advance=(state,playing,bpm,frames=60)=>{let s=state;for(let i=0;i<frames;i++)s=advanceDeckMotion(s,1/60,playing,bpm);return s};
test('cassette starts smoothly and does not jump to full rotation speed',()=>{
 const first=advanceDeckMotion({angle:0,velocity:0},1/60,true,108);
 const settled=advance({angle:0,velocity:0},true,108,90);
 assert.ok(first.velocity>0&&first.velocity<settled.velocity);
 assert.ok(first.angle>0&&first.angle<Math.PI*2);
});
test('cassette slows with inertia and comes to a complete stop',()=>{
 const moving=advance({angle:0,velocity:0},true,140,70);
 const stopped=advance(moving,false,140,600);
 assert.ok(advanceDeckMotion(moving,1/60,false,140).velocity<moving.velocity);
 assert.equal(stopped.velocity,0);
});
test('BPM changes rotation speed without restarting angle',()=>{
 const old=advance({angle:1,velocity:0},true,80,100);
 const fast=advance(old,true,170,100);
 assert.ok(fast.velocity>old.velocity);
 assert.ok(fast.angle>=0&&fast.angle<Math.PI*2);
});
test('suspended tabs have bounded frame delta and finite angles',()=>{
 const s=advanceDeckMotion({angle:1,velocity:2},10,false,90);
 assert.ok(Number.isFinite(s.angle)&&Number.isFinite(s.velocity));
 assert.ok(s.velocity>0);
});
