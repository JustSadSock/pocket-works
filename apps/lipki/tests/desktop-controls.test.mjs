import test from 'node:test';
import assert from 'node:assert/strict';
import {readSoloControls,readDuoControls,isGameplayCode,isTypingTarget} from '../desktop-controls.js';
import {initialize,simulate} from '../physics.js';

test('PC movement and actions use physical codes regardless of keyboard layout',()=>{
 const left=readSoloControls(new Set(['KeyA','Space','KeyE']));
 assert.deepEqual({x:left.x,jump:left.jump,stick:left.stick},{x:-1,jump:true,stick:true});
 const right=readSoloControls(new Set(['ArrowRight','ArrowUp','ShiftRight']));
 assert.deepEqual({x:right.x,jump:right.jump,stick:right.stick},{x:1,jump:true,stick:true});
 assert.equal(readSoloControls(new Set(['KeyA','KeyD'])).x,0);
 assert.equal(isGameplayCode('Space'),true);
 assert.equal(isGameplayCode('KeyR'),false);
});
test('Two keyboard players can steer opposite directions and act independently',()=>{
 const keys=new Set(['KeyA','KeyW','ArrowRight','ArrowDown']);
 const [one,two]=readDuoControls(keys);
 assert.deepEqual({x:one.x,jump:one.jump,stick:one.stick},{x:-1,jump:true,stick:false});
 assert.deepEqual({x:two.x,jump:two.jump,stick:two.stick},{x:1,jump:false,stick:true});
});
test('Touch commands remain compatible with keyboard control',()=>{
 const solo=readSoloControls(new Set(),new Set(['right','jump','stick']));
 assert.equal(solo.x,1);assert.equal(solo.jump,true);assert.equal(solo.stick,true);
});
test('Typing inside form controls never triggers gameplay shortcuts',()=>{
 assert.equal(isTypingTarget({closest:()=>({tagName:'INPUT'})}),true);
 assert.equal(isTypingTarget({closest:()=>null}),false);
 assert.equal(isTypingTarget(null),false);
});
test('Two players receive separate inputs in actual physics simulation',()=>{
 const world=initialize([{id:'hero-1'},{id:'hero-2'}]);
 for(let i=0;i<75;i++)simulate(world,1/60);
 const previous=world.players.map(p=>p.x);
 const [a,b]=readDuoControls(new Set(['KeyA','ArrowRight']));
 world.inputs['hero-1']=a;world.inputs['hero-2']=b;
 for(let i=0;i<14;i++)simulate(world,1/60);
 assert.ok(world.players[0].x<previous[0]);
 assert.ok(world.players[1].x>previous[1]);
});
