import test from 'node:test';
import assert from 'node:assert/strict';
import {PROTOCOLS,sanitizeProtocol,applyProtocol,extraEnemiesForPulse,
  incomingProtocolDamage,enemyProtocolSpeed,spawnCadence,registerCombatChain,
  sanitizeRunHistory,recordFinishedRun,observedRunStats,echoBonus} from '../runTuning.js';
import {earnEchoes,sanitizeArchive} from '../runPaths.js';
import {validateRun} from '../stability.js';

test('three opt-in protocols have actual distinct penalties and rewards',()=>{
 assert.equal(PROTOCOLS.length,4);assert.equal(sanitizeProtocol('fake'),'normal');
 const base=()=>({maxHp:100,hp:100,immune:{heat:0},pulseMax:3,wave:0,toSpawn:7});
 const fever=base();applyProtocol(fever,'fever');
 assert.equal(fever.immune.heat,25);
 const fragile=base();applyProtocol(fragile,'fragile');
 assert.equal(fragile.maxHp,82);assert.equal(fragile.hp,82);
 assert.equal(incomingProtocolDamage(fragile,20),24);
 const siege=base();applyProtocol(siege,'siege');
 assert.equal(extraEnemiesForPulse(siege.protocol,3),2);
 assert.equal(extraEnemiesForPulse('siege',1),0);
 assert.ok(enemyProtocolSpeed(siege)>1);
 assert.equal(extraEnemiesForPulse('fragile',3),0);
 assert.equal(echoBonus(10,{protocol:'siege',elapsed:140,wave:3},false),6);
 assert.equal(echoBonus(10,{protocol:'siege',elapsed:15,wave:1},false),0);
 assert.equal(echoBonus(10,{protocol:'siege',elapsed:140,wave:1},false),0);
 assert.equal(echoBonus(10,{protocol:'normal',elapsed:140,wave:5},true),0);
});
test('adaptive spawn cadence is bounded, responsive but never artificially stalls',()=>{
 for(let i=0;i<=1000;i++){
  const u=i/1001;
  const base=spawnCadence({maxHp:100,hp:100,enemies:[],protocol:'normal'},u);
  const crowded=spawnCadence({maxHp:100,hp:20,enemies:Array(11).fill({}),protocol:'normal'},u);
  const aggressive=spawnCadence({maxHp:100,hp:100,enemies:[],protocol:'siege'},u);
  assert.ok(base>=.34&&base<=1.16);
  assert.ok(crowded>=base);
  assert.ok(aggressive<=base);
 }
});
test('kill chains reward actual rapid successive kills without rewarding inactive time',()=>{
 const state={elapsed:100,score:10,combo:0,comboExpires:0,peakCombo:0};
 assert.deepEqual(registerCombatChain(state),{combo:1,bonus:0});
 state.elapsed=102;assert.deepEqual(registerCombatChain(state),{combo:2,bonus:18});
 state.elapsed=103;assert.deepEqual(registerCombatChain(state),{combo:3,bonus:36});
 assert.equal(state.score,64);assert.equal(state.peakCombo,3);
 state.elapsed=110;assert.deepEqual(registerCombatChain(state),{combo:1,bonus:0});
 assert.equal(state.peakCombo,3);
});
test('observed results are real samples, bounded to 12, median and wins follow data',()=>{
 const archive=sanitizeArchive({echoes:8,runs:3,unlocked:[],history:[],protocol:'siege'});
 for(let i=0;i<17;i++){
   const entry=recordFinishedRun(archive,{elapsed:400+i*30,wave:5,waveTime:65,
      stageTimes:[{wave:1,seconds:100},{wave:2,seconds:90}],kills:45+i,score:1000+i,
      damageTaken:200,peakCombo:5,protocol:i%2?'normal':'siege'},i%2===0);
   assert.equal(entry.stageTimes[0],100);
   assert.equal(entry.stageTimes[4],65);
 }
 assert.equal(archive.history.length,12);
 const stats=observedRunStats(archive.history);
 assert.equal(stats.runs,12);assert.equal(stats.wins,6);assert.equal(stats.winRate,50);
 assert.ok(stats.medianSeconds>0);
 assert.deepEqual(sanitizeRunHistory(archive.history),archive.history);
 assert.deepEqual(sanitizeArchive(archive).history,archive.history);
});
test('challenge replay earnings and legacy migration cannot duplicate bonuses',()=>{
 const archive=sanitizeArchive({echoes:0,unlocked:[],runs:0,protocol:'fragile'});
 const run={elapsed:120,wave:3,kills:24,protocol:'fragile'};
 const gained=earnEchoes(archive,run,false);
 assert.equal(gained,8); // base 5, challenge ceil(2.5)=3.
 assert.equal(archive.echoes,8);
 const old=validateRun({v:5,seed:413,x:3,z:3,wave:2,hp:80});
 assert.equal(old.protocol,'normal');assert.deepEqual(old.stageTimes,[]);
 const saved=validateRun({...old,protocol:'siege',damageTaken:128,combo:4,
   comboExpires:160,peakCombo:7,stageTimes:[{wave:1,seconds:205}]});
 assert.deepEqual(validateRun(saved),saved);
 assert.equal(saved.protocol,'siege');assert.equal(saved.damageTaken,128);
 assert.equal(saved.stageTimes[0].seconds,205);
});
