import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, commandGame, stepGame, LEVEL, FIXED_DT, ROBOT, progressGame } from './engine.js';
function advance(s,seconds){let ev=[];for(let i=0;i<seconds/FIXED_DT;i++)ev.push(...stepGame(s,FIXED_DT));return ev}
test('forward motor moves without input',()=>{const s=createGame();advance(s,.3);assert.ok(s.x>1.2);});
test('reverse command changes direction and has cooldown',()=>{const s=createGame();assert.equal(commandGame(s,'reverse'),'reverse');assert.equal(s.dir,-1);assert.equal(commandGame(s,'reverse'),'cooldown');advance(s,.3);assert.equal(commandGame(s,'reverse'),'reverse');});
test('jump applies upward impulse on next fixed frame',()=>{const s=createGame();commandGame(s,'jump');const events=stepGame(s,FIXED_DT);assert.ok(events.includes('jump'));assert.ok(s.vy<0);});
test('walls prevent driving straight through raised step',()=>{const s=createGame();advance(s,1.5);assert.ok(s.x<=LEVEL.platforms[1].x-ROBOT.halfWidth+.02);assert.equal(s.finished,false);});
test('falling resets at checkpoint and records failure',()=>{const s=createGame();s.x=4.95;s.y=7.9;s.vy=6;const ev=advance(s,.7);assert.ok(ev.includes('respawn'));assert.equal(s.respawns,1);assert.ok(s.x<3.3);});
test('checkpoint moves respawn destination',()=>{const s=createGame();s.x=10.4;s.y=6.25-ROBOT.halfHeight;s.ground=true;s.vx=0;const ev=stepGame(s,FIXED_DT);assert.ok(ev.includes('checkpoint'));assert.ok(s.checkpoint>9);});
test('goal triggers exactly once and freezes the simulation',()=>{const s=createGame();s.x=16.52;s.y=6.5-ROBOT.halfHeight;s.ground=true;const ev=stepGame(s,FIXED_DT);assert.ok(ev.includes('finish'));assert.equal(stepGame(s,FIXED_DT).length,0);assert.equal(s.finished,true);});
test('finite progress from start to finish',()=>{assert.equal(progressGame(createGame()),0);const s=createGame();s.x=18;assert.equal(progressGame(s),1)});
test('deterministic fixed timestep',()=>{const a=createGame(),b=createGame();for(let i=0;i<700;i++){if([60,135,300,500].includes(i)){commandGame(a,i%2?'reverse':'jump');commandGame(b,i%2?'reverse':'jump')}stepGame(a,FIXED_DT);stepGame(b,FIXED_DT)}assert.deepEqual(a,b)});
test('large dt is bounded to avoid tunnelling after tab suspension',()=>{const s=createGame();stepGame(s,20);assert.ok(s.t<.03)});

test('course is winnable and checkpoint fires once',()=>{const s=createGame();let a=false,b=false,n=0;for(let i=0;i<9/FIXED_DT&&!s.finished;i++){if(!a&&s.x>4.1){commandGame(s,'jump');a=true;}if(!b&&s.x>11.9&&s.ground){commandGame(s,'jump');b=true;}n+=stepGame(s,FIXED_DT).filter(x=>x==='checkpoint').length;}assert.equal(s.finished,true);assert.equal(n,1);assert.equal(s.respawns,0);});
