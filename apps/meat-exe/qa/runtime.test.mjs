import test from 'node:test';
import assert from 'node:assert/strict';
import {initialAutoQuality,autoQualityWindow,runtimeBudget} from '../runtimeBudget.js';
import {pulsePlan,pulseStats,pulseEnemyKind,nextPulse} from '../runPacing.js';
import {guardianForWave,guardianReady,guardianSpawnResolved} from '../guardians.js';

test('auto quality stops oscillating across realistic 4-second FPS windows',()=>{
 let q='medium',s=initialAutoQuality(),changes=0;
 const first=[36,37,59,60,36,37,59,60,36,37,36,36,36,36,36,36,36,36,36];
 for(const fps of first){
  const r=autoQualityWindow(s,q,fps,4);
  if(r.quality!==q)changes++;
  q=r.quality;s=r.state;
 }
 assert.equal(q,'low');
 assert.ok(changes<=2);
 let upgrades=0;
 for(let i=0;i<12;i++){
  const r=autoQualityWindow(s,q,60,4);
  if(q!==r.quality)upgrades++;
  q=r.quality;s=r.state;
 }
 assert.ok(upgrades<=1);
 assert.ok(s.observedFps>=59);
 const gpu=autoQualityWindow(s,'medium',15,4,true);
 assert.equal(gpu.quality,'low');
 assert.equal(autoQualityWindow(gpu.state,'low',60,4,true).quality,'low');
});
test('speed-mode FPS cap permits upgrading after genuine 46-50 rendered FPS',()=>{
 let q='low',state=initialAutoQuality();
 for(let i=0;i<9;i++){
  const result=autoQualityWindow(state,q,48,4);
  state=result.state;q=result.quality;
 }
 assert.equal(q,'medium');
 assert.ok(state.samples>=4);
 q='low';state=initialAutoQuality();
 for(let i=0;i<14;i++){
  const result=autoQualityWindow(state,q,43,4);
  state=result.state;q=result.quality;
 }
 assert.equal(q,'low','43 real frames/s is not enough for recovering detail');
});

test('GPU budgets reject leaked chunks and remain correct under realistic samples',()=>{
 const baseline={visibleChunks:9,instancedLive:235,gpuGeometries:140,layoutCache:80,tissueCache:42};
 assert.deepEqual(runtimeBudget(baseline),{ok:true,reason:'bounded'});
 for(const [key,bad] of [['visibleChunks',10],['instancedLive',421],
    ['gpuGeometries',321],['layoutCache',126],['tissueCache',121]]){
   const result=runtimeBudget({...baseline,[key]:bad});
   assert.equal(result.ok,false,key);
 }
 assert.equal(runtimeBudget({}).ok,false);
});
test('full campaign transition ledger cannot deadlock and guarantees three different pulse types per organ',()=>{
 let simulated=0;
 for(let seed=0;seed<750;seed++){
  let ordinary=0,guardians=0;
  for(let wave=1;wave<=4;wave++){
   const patterns=new Set(),planned=[];
   const state={seed,wave,pulse:1,pulseMax:3,pulseSpawned:0,toSpawn:0,
     enemies:[],guardianPending:0,score:0,biomass:0,hp:100,maxHp:100,immune:{heat:0}};
   for(let pulse=1;pulse<=3;pulse++){
    const p=pulsePlan(seed,wave,pulse);
    patterns.add(p.kind);planned.push(p);
    assert.ok(p.count>=6&&p.count<=13);
    const kinds=Array.from({length:p.count},(_,i)=>pulseEnemyKind(seed,wave,pulse,i));
    assert.equal(kinds.length,p.count);ordinary+=kinds.length;
    if(pulse<3){
     const next=nextPulse(state);
     assert.equal(next.pulse,pulse+1);
     state.toSpawn=0;
    }
   }
   assert.equal(patterns.size,3);
   if(guardianForWave(wave)){
    state.guardianPending=wave;
    assert.ok(guardianReady(state));
    assert.ok(guardianSpawnResolved(state,true));
    assert.equal(state.guardianPending,0);
    guardians++;
   }
  }
  assert.equal(ordinary,111);
  assert.equal(guardians,4);
  assert.equal(pulseStats(seed).enemies,111);
  simulated++;
 }
 assert.equal(simulated,750);
});
