import test from 'node:test';
import assert from 'node:assert/strict';
import {LEVELS,initialize,simulate,resetLevel,getView} from '../physics.js';
const members=[{id:'a'},{id:'b'}];
const advance=(w,frames=60)=>{for(let i=0;i<frames;i++)simulate(w,1/60)};
const place=(q,x,y)=>Object.assign(q,{x,y,vx:0,vy:0,ground:true});
test('Ten different stages always require their own objective before the exit',()=>{
 assert.equal(LEVELS.length,10);
 for(let level=0;level<10;level++){
  const w=initialize(members,level);advance(w,75);
  assert.ok(getView(w).total>0);
  assert.equal(w.gateOpen,false);
  place(w.players[0],970,491);place(w.players[1],976,491);
  simulate(w,1/60);assert.equal(w.level,level);
 }
});
test('Smooth momentum: gentle acceleration and finite slowdown',()=>{
 const w=initialize(members);advance(w,60);
 w.inputs.a={x:1};simulate(w,1/60);assert.ok(w.players[0].vx>0&&w.players[0].vx<30);
 advance(w,45);assert.ok(w.players[0].vx>145&&w.players[0].vx<185);
 w.inputs.a={x:0};simulate(w,1/60);assert.ok(w.players[0].vx>0);
 advance(w,40);assert.ok(Math.abs(w.players[0].vx)<1);
});
test('Single and simultaneous buttons activate the lock appropriately',()=>{
 const one=initialize(members,0);place(one.players[0],425,491);
 advance(one,3);assert.equal(one.gateOpen,true);
 const two=initialize(members,1);place(two.players[0],300,491);
 advance(two,3);assert.equal(two.gateOpen,false);
 place(two.players[1],600,491);advance(two,3);assert.equal(two.gateOpen,true);
});
test('Spool target unlocks only after reaching the ring',()=>{
 const w=initialize(members,2);advance(w,60);assert.equal(w.targetDone,false);
 Object.assign(w.ball,{x:675,y:484,vx:0,vy:0});advance(w,3);
 assert.equal(w.targetDone,true);assert.equal(w.gateOpen,true);
});
test('Velcro patches require adhesion; merely touching is insufficient',()=>{
 const w=initialize(members,3);place(w.players[0],350,411);advance(w,1);
 assert.deepEqual(w.patches,[false,false]);
 w.inputs.a={stick:true};advance(w,3);assert.equal(w.patches[0],true);
 place(w.players[1],600,411);w.inputs.b={stick:true};advance(w,3);
 assert.equal(w.gateOpen,true);
});
test('Stage five: both launchers work and all coordinates stay finite',()=>{
 const w=initialize(members,4);
 const [a,b]=w.players;
 Object.assign(a,{x:300,y:479,vx:175,vy:160});
 Object.assign(b,{x:580,y:479,vx:175,vy:160});
 w.inputs.a={x:1};w.inputs.b={x:1};advance(w,10);
 w.inputs.a={x:-1};w.inputs.b={x:-1};advance(w,40);
 assert.deepEqual(w.sigils,[true,true]);assert.equal(w.gateOpen,true);
 w.inputs.a={x:0};w.inputs.b={x:0};
 advance(w,2800);
 assert.equal(w.level,4);
 assert.ok(w.players.every(q=>Number.isFinite(q.x)&&Number.isFinite(q.y)&&Number.isFinite(q.vx)));
});
test('Combination puzzles need both the ball and player',()=>{
 const w=initialize(members,5);
 Object.assign(w.ball,{x:683,y:484,vx:0,vy:0});
 advance(w,4);assert.equal(w.targetDone,true);assert.equal(w.gateOpen,false);
 place(w.players[0],445,491);advance(w,4);assert.equal(w.gateOpen,true);
});
test('Sequential adhesive patches are ordered',()=>{
 const w=initialize(members,6);
 place(w.players[0],635,331);w.inputs.a={stick:true};advance(w,3);
 assert.deepEqual(w.patches,[false,false]);
 resetLevel(w,6);assert.deepEqual(w.patches,[false,false]);assert.equal(w.gateOpen,false);
});
test('Completing a solved level takes both heroes into the pocket',()=>{
 const w=initialize(members,9);
 w.patches=[true];w.sigils=[true];w.targetDone=true;advance(w,2);
 assert.equal(w.gateOpen,true);
 place(w.players[0],981,470);advance(w,1);assert.equal(w.finished,false);
 place(w.players[1],980,470);advance(w,2);assert.equal(w.finished,true);
});
