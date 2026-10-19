// MEAT.EXE / 1.8.3 — organ contractions are real combat encounters,
// not invisible timers. Each organ cycles through three distinct threat
// patterns; the last is followed by the existing anatomical guardian.
import {chooseEnemyKind} from './ecology.js';
const WAVES=Object.freeze({
  1:[6,7,9],
  2:[7,9,10],
  3:[8,10,12],
  4:[9,11,13]
});
export const PULSE_KINDS=Object.freeze([
 Object.freeze({id:'pack',name:'НАПЛЫВ ПОЛЗУНОВ',desc:'Быстрые цели занимают проходы'}),
 Object.freeze({id:'spore',name:'ЯДОВИТЫЙ ВЫБРОС',desc:'Плевуны перекрывают дальние коридоры'}),
 Object.freeze({id:'shell',name:'КОСТЯНОЙ НАТИСК',desc:'Тяжелобронированные противники давят фронт'})
]);
function hash(seed,wave,pulse,salt=0){
 let n=((seed>>>0)^Math.imul(wave,0x9e3779b1)^Math.imul(pulse,0x85ebca6b)^Math.imul(salt,0xc2b2ae35))>>>0;
 n=Math.imul(n^(n>>>16),0x7feb352d);n=Math.imul(n^(n>>>15),0x846ca68b);
 return (n^(n>>>16))>>>0;
}
export function pulsePlan(seed,wave,pulse=1){
 const counts=WAVES[wave];
 if(!counts||!Number.isInteger(pulse)||pulse<1||pulse>3)return null;
 // Three patterns rotate once per organ; no seed can lock a whole stage
 // into one repeated behavior.
 const first=wave===1?0:hash(seed,wave,0)%3;
 const kind=PULSE_KINDS[(first+pulse-1)%3];
 return Object.freeze({wave,pulse,total:3,count:counts[pulse-1],
   kind:kind.id,name:kind.name,description:kind.desc});
}
export function pulseEnemyKind(seed,wave,pulse,ordinal){
 const plan=pulsePlan(seed,wave,pulse);
 if(!plan)return chooseEnemyKind(wave,(hash(seed,wave,pulse,ordinal)%10000)/10000);
 const roll=hash(seed,wave,pulse,ordinal+19)/4294967296;
 // A seeded but mixed lineup: at least 38% baseline diversity from the
 // ordinary ecology, plus a single visible preference per contraction.
 const bias=hash(seed,wave,pulse,ordinal+37)/4294967296;
 if(bias<.38)return chooseEnemyKind(wave,roll);
 if(plan.kind==='pack')return roll<.74?'crawler':chooseEnemyKind(wave,roll);
 if(plan.kind==='spore')return roll<.67?'spitter':chooseEnemyKind(wave,roll);
 return roll<.62?'brute':chooseEnemyKind(wave,roll);
}
export function nextPulse(state){
 if(!state||state.pulseMax!==3||!WAVES[state.wave]||
  !Number.isInteger(state.pulse)||state.pulse<1||state.pulse>=3||
  state.toSpawn!==0||state.enemies.length!==0||state.guardianPending)return null;
 const next=pulsePlan(state.seed,state.wave,state.pulse+1);
 state.pulse=next.pulse;state.pulseSpawned=0;
 state.toSpawn=next.count;state.spawnClock=.7;
 // Clearing a real encounter replenishes scarce combat resources.
 state.biomass=Math.min(99,Math.max(0,state.biomass||0)+1);
 state.hp=Math.min(state.maxHp,state.hp+5);
 state.score=Math.max(0,state.score||0)+60*next.pulse;
 state.immune.heat=Math.min(100,Math.max(0,state.immune.heat||0)+5);
 return next;
}
export function pulseStats(seed){
 let enemies=0,stages=0,variants=new Set(),min=Infinity,max=0;
 for(let w=1;w<=4;w++)for(let p=1;p<=3;p++){
  const plan=pulsePlan(seed,w,p);enemies+=plan.count;variants.add(plan.kind);
  min=Math.min(min,plan.count);max=Math.max(max,plan.count);stages++;
 }
 return Object.freeze({enemies,stages,variants:variants.size,min,max,guardians:4});
}
