import test from 'node:test';
import assert from 'node:assert/strict';
import {immuneDefaults,sanitizeImmune,provokeImmune,updateImmune,immuneIntensity,IMMUNE_EVENTS} from '../immunity.js';
import {validateRun} from '../stability.js';
const tick=(s,dt=.1,over={})=>updateImmune(s,dt,{wave:2,enemies:0,remaining:3,playerHp:100,...over});
test('immune defaults are bounded and old run migration stays safe',()=>{
 const s=immuneDefaults();assert.equal(s.heat,0);assert.equal(s.pending,'');
 const v=validateRun({v:5,seed:413,x:3,z:3,hp:100,wave:2});
 assert.deepEqual(v.immune,s);
 const corrupt=sanitizeImmune({heat:Infinity,cooldown:-200,guardianStages:[-1,2,2,9],pending:'bogus'});
 assert.equal(corrupt.heat,0);assert.equal(corrupt.cooldown,0);
 assert.deepEqual(corrupt.guardianStages,[2]);
 assert.deepEqual(sanitizeImmune(sanitizeImmune(corrupt)),corrupt);
});
test('breaching tissue provokes staged warning, then gastric sentinel response',()=>{
 const s=immuneDefaults();s.heat=18;provokeImmune(s,'rupture',2);
 assert.ok(s.heat>=IMMUNE_EVENTS.guardian.minHeat);
 let ev=tick(s,.016);assert.equal(ev.kind,'warning');assert.equal(ev.event,'guardian');
 assert.ok(s.warning>2);assert.equal(s.responses,0);
 for(let i=0;i<180;i++)ev=tick(s,.016);
 assert.ok(s.responses===1,'immunity dispatch should be counted once');
 assert.equal(ev?.kind,'dispatch');assert.deepEqual(ev.units,['warden']);
 assert.deepEqual(s.guardianStages,[2]);assert.ok(s.cooldown>=16);
 assert.equal(tick(s,.1),null);
});
test('already summoned gastric sentinel does not repeat within a world stage',()=>{
 const s=immuneDefaults();s.heat=90;s.guardianStages=[2];
 const ev=tick(s,.05);
 assert.equal(ev.event,'purge');
});
test('failing crowd and low health postpone scheduled threat',()=>{
 for(const context of [{enemies:14},{playerHp:15}]){
  const s=immuneDefaults();s.heat=90;tick(s,.01);
  let ev;for(let i=0;i<175;i++)ev=tick(s,.017,context);
  assert.equal(s.responses,0);assert.equal(s.pending,'');
  assert.ok(s.cooldown>0);assert.ok(ev===null||ev.kind!=='dispatch');
 }
});
test('response pressure naturally recedes rather than infinitely accumulating',()=>{
 const s=immuneDefaults();s.heat=80;s.cooldown=30;
 for(let i=0;i<1000;i++)tick(s,.02,{wave:4,remaining:0});
 assert.ok(s.heat<75&&s.heat>=0);assert.equal(s.responses,0);
 assert.ok(immuneIntensity(s)<1);
});
test('no director miniboss during final heart or with an injured player',()=>{
 for(const wave of [5]){const s=immuneDefaults();s.heat=100;
  for(let i=0;i<100;i++)assert.equal(tick(s,.02,{wave}),null);}
 const s=immuneDefaults();s.heat=100;
 assert.equal(tick(s,.016,{playerHp:17}),null);
});
test('long simulation cannot exceed active response budgets or produce endless waves',()=>{
 let maxResponses=0;
 for(let seed=0;seed<250;seed++){
  const s=immuneDefaults();s.heat=(seed*47)%100;
  for(let step=0;step<300;step++){
   if(step%115===0)provokeImmune(s,'rupture',2);
   tick(s,.1,{enemies:seed%15,playerHp:seed%5===0?16:100});
  }
  maxResponses=Math.max(maxResponses,s.responses);
  assert.ok(s.responses<=3,'too frequent immunity wave '+seed);
  assert.ok(s.heat<=100&&s.heat>=0);
  assert.ok(s.guardianStages.length<=1);
 }
 assert.ok(maxResponses>0);
});
