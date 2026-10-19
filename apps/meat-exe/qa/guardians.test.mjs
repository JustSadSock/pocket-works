import test from 'node:test';
import assert from 'node:assert/strict';
import {GUARDIAN_TYPES,guardianForWave,isGuardian,guardianReady,guardianSpawnResolved,
 guardianDamage,guardianAction,sanitizeGuardianPending} from '../guardians.js';
import {initialEnemyIntent,advanceEnemyIntent,interruptIntent} from '../ecology.js';
import {validateRun} from '../stability.js';
test('three mutually distinct organ guardians and no duplicate wave spawns',()=>{
 assert.deepEqual([1,3,4].map(w=>guardianForWave(w).type),['clot','ossuary','synapse']);
 assert.equal(new Set(GUARDIAN_TYPES).size,3);
 assert.equal(guardianForWave(2),null);assert.equal(guardianForWave(5),null);
 for(const w of [1,3,4]){
  const state={wave:w,guardianPending:w,toSpawn:0,enemies:[]};
  assert.ok(guardianReady(state));
  assert.equal(guardianSpawnResolved(state,false),false);
  assert.equal(state.guardianPending,w);
  state.enemies.push({type:guardianForWave(w).type,hp:100});
  assert.equal(guardianSpawnResolved(state,true),true);
  assert.equal(state.guardianPending,0);
  assert.equal(guardianReady(state),false);
 }
});
test('vascular guard has a fair announced proximity pressure burst',()=>{
 const e={type:'clot',x:0,z:0,...initialEnemyIntent('clot')};e.attack=0;
 assert.equal(advanceEnemyIntent(e,.016,{x:0,z:0,visible:true,playerX:2.4,playerZ:0}).action,'warn');
 assert.ok(e.windup>1.0);
 assert.equal(advanceEnemyIntent(e,1.4,{x:0,z:0,visible:true,playerX:2.4,playerZ:0}).action,'pulse');
 assert.equal(guardianAction('clot','pulse',e,{x:2.4,z:0}).hit,true);
 assert.equal(guardianAction('clot','pulse',e,{x:3.5,z:0}).hit,false);
});
test('marrow boss shield protects only front and opens during windup',()=>{
 const e={type:'ossuary',x:0,z:0,facing:0,windup:0};
 assert.ok(guardianDamage(e,100,0,2)<30);
 assert.equal(guardianDamage(e,100,2,0),100);
 assert.equal(guardianDamage(e,100,0,-2),100);
 e.windup=1;assert.equal(guardianDamage(e,100,0,2),100);
 const shots=guardianAction('ossuary','shards',e,{x:1,z:1});
 assert.equal(shots.angles.length,5);assert.equal(shots.angles[2],0);
 assert.equal(interruptIntent({...e,windup:1},70,0),true);
});
test('neural boss locks on an old position and lets a moving player evade',()=>{
 const e={type:'synapse',x:0,z:0,...initialEnemyIntent('synapse')};e.attack=0;
 assert.equal(advanceEnemyIntent(e,.016,{x:0,z:0,visible:true,playerX:5,playerZ:0}).action,'warn');
 assert.equal(e.intentX,5);assert.equal(e.intentZ,0);
 assert.equal(advanceEnemyIntent(e,1.5,{x:0,z:0,visible:true,playerX:5,playerZ:4}).action,'surge');
 assert.equal(guardianAction('synapse','surge',e,{x:5,z:0}).hit,true);
 assert.equal(guardianAction('synapse','surge',e,{x:5,z:4}).hit,false);
});
test('old saves remain unchanged; v1.8.2 guardian queue and boss types survive migration',()=>{
 const original={v:5,seed:413,x:3,z:3,wave:3,hp:92,toSpawn:0,
  guardianPending:3,guardianDefeated:[1,1,4,404],
  enemies:[{type:'ossuary',x:5,z:4,hp:107,facing:.8}],pickups:[]};
 const v=validateRun(original);
 assert.equal(v.guardianPending,3);
 assert.deepEqual(v.guardianDefeated,[1,4]);
 assert.equal(v.enemies[0].type,'ossuary');
 assert.equal(v.enemies[0].facing,.8);
 assert.deepEqual(validateRun(v),v);
 assert.equal(validateRun({...original,guardianDefeated:[3]}).guardianPending,0);
 assert.equal(validateRun({...original,guardianPending:999}).guardianPending,0);
 assert.equal(sanitizeGuardianPending(3,3),3);
 assert.equal(sanitizeGuardianPending(2,2),0);
 const old=validateRun({v:4,seed:413,x:3,z:3,wave:3,hp:100});
 assert.equal(old.guardianPending,0);assert.deepEqual(old.guardianDefeated,[]);
 assert.equal(isGuardian('warden'),false);
});
