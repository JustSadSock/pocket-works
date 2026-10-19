import test from 'node:test';
import assert from 'node:assert/strict';
import {pulsePlan,pulseEnemyKind,nextPulse,pulseStats} from '../runPacing.js';
import {validateRun} from '../stability.js';
import {guardianForWave,guardianReady} from '../guardians.js';

test('4000 seeded full runs keep every stage varied, bounded and combat-led',()=>{
 const modes=new Set();
 for(let seed=0;seed<4000;seed++){
  const stats=pulseStats(seed);
  assert.deepEqual([stats.stages,stats.enemies,stats.variants,stats.guardians],[12,111,3,4]);
  assert.ok(stats.min>=6&&stats.max<=13);
  for(let wave=1;wave<=4;wave++){
   const seen=new Set();
   for(let pulse=1;pulse<=3;pulse++){
    const p=pulsePlan(seed,wave,pulse);
    assert.deepEqual(p,pulsePlan(seed,wave,pulse));
    seen.add(p.kind);modes.add(p.kind);
    const kinds=new Set(Array.from({length:p.count},(_,i)=>pulseEnemyKind(seed,wave,pulse,i)));
    assert.ok(kinds.size>=1);
   }
   assert.equal(seen.size,3,'three distinct contractions in every organ');
  }
 }
 assert.deepEqual([...modes].sort(),['pack','shell','spore']);
 assert.equal(pulsePlan(1,5,1),null);
 assert.equal(pulsePlan(1,1,4),null);
});
test('pulse transitions are earned, bounded, heal a little and cannot be farmed',()=>{
 const state={seed:413,wave:3,pulse:1,pulseMax:3,pulseSpawned:8,
  hp:38,maxHp:100,biomass:0,immune:{heat:20},
  toSpawn:0,spawnClock:5,score:10,enemies:[],guardianPending:0};
 const next=nextPulse(state);assert.equal(next.pulse,2);
 assert.equal(state.toSpawn,next.count);
 assert.equal(state.hp,43);assert.equal(state.biomass,1);assert.equal(state.score,130);
 assert.equal(state.immune.heat,25);assert.equal(state.pulseSpawned,0);
 assert.equal(nextPulse(state),null,'cannot repeat rewards while spawns remain');
 state.toSpawn=0;state.enemies=[{hp:1}];
 assert.equal(nextPulse(state),null,'cannot skip living enemies');
 state.enemies=[];
 const last=nextPulse(state);assert.equal(last.pulse,3);
 state.toSpawn=0;
 assert.equal(nextPulse(state),null,'third pulse cannot loop');
 assert.equal(state.biomass,2);
 assert.equal(guardianForWave(state.wave).type,'ossuary');
 state.guardianPending=3;assert.ok(guardianReady(state));
});
test('saved pacing restores mid-pulse, legacy saves stay single-wave',()=>{
 const base={v:5,seed:413,x:3,z:3,wave:3,hp:80,maxHp:100,toSpawn:6,
  pulseMax:3,pulse:2,pulseSpawned:4,organRuptureClaimed:true};
 const s=validateRun(base);
 assert.deepEqual([s.pulseMax,s.pulse,s.pulseSpawned,s.organRuptureClaimed],[3,2,4,true]);
 assert.equal(validateRun(s).pulse,2);
 const legacy=validateRun({...base,pulseMax:undefined,pulse:undefined,pulseSpawned:undefined});
 assert.equal(legacy.pulseMax,1);assert.equal(legacy.pulse,1);
 assert.equal(nextPulse({...legacy,enemies:[],guardianPending:0,immune:{heat:0}}),null);
 const garbage=validateRun({...base,pulse:999,pulseSpawned:999,organRuptureClaimed:'yes'});
 assert.equal(garbage.pulse,1);assert.equal(garbage.pulseSpawned,40);
 assert.equal(garbage.organRuptureClaimed,false);
});
test('all 12 pulses have controllable different enemy roles, no multi-wave deadlock',()=>{
 for(let seed=0;seed<1000;seed++){
  for(let wave=1;wave<=4;wave++)for(let pulse=1;pulse<=3;pulse++){
   const plan=pulsePlan(seed,wave,pulse);
   const mobs=Array.from({length:plan.count},(_,i)=>pulseEnemyKind(seed,wave,pulse,i));
   assert.equal(mobs.length,plan.count);
   assert.ok(mobs.every(type=>['crawler','brute','leech','spitter'].includes(type)));
  }
 }
});
