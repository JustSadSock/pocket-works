// MEAT.EXE / tactical enemy ecology.
// Pure, deterministic finite-state attack protocol. Rendering is a projection of this state.
// No damage is dealt on windup start: every attack telegraphs first.
export const ENEMY_TELLS=Object.freeze({
  crawler:{name:'ПРЫЖОК',windup:.38,range:1.14,cooldown:1.5,color:0xeb6858},
  spitter:{name:'ПЛЕВОК',windup:.72,range:8,cooldown:2.25,color:0xa2bb53},
  brute:{name:'ТАРАН',windup:.79,range:4.8,cooldown:2.6,color:0xf5b783},
  heart:{name:'ЗАЛП',windup:.88,range:10,cooldown:2.25,color:0xefb3ce},
  leech:{name:'ВЫСАСЫВАНИЕ',windup:.83,range:3.6,cooldown:3.1,color:0x9b7bd1}
});
export const ENEMY_KINDS=Object.freeze(Object.keys(ENEMY_TELLS));

const cap=(v,min,max)=>Math.max(min,Math.min(max,v));
export function initialEnemyIntent(type,id=0){
 return {attack:1+(id%5)*.14,windup:0,windupKind:'',intentX:0,intentZ:0,
  lunge:0,lungeX:0,lungeZ:0,terrainClock:0,stagger:0,hitFlash:0};
}
export function resetIntent(e,delay=.65){
 e.windup=0;e.windupKind='';e.lunge=0;e.attack=Math.max(e.attack||0,delay);
}
export function interruptIntent(e,damage,weapon){
 if(!e.windup||e.windup<=0)return false;
 // Heavy impacts can cancel the dangerous commitment, not trivial grazing shots.
 const threshold=e.type==='brute'?(weapon===1?12:32):e.type==='heart'?80:e.type==='spitter'?(weapon===1?12:20):e.type==='leech'?(weapon===1?12:24):22;
 if(damage<threshold)return false;
 resetIntent(e,e.type==='heart'?.65:1);
 e.stagger=Math.max(e.stagger||0,.35);
 return true;
}
export function advanceEnemyIntent(e,dt,context){
 const {x,z,visible,playerX,playerZ}=context;
 const gap=Math.hypot(playerX-x,playerZ-z);
 e.attack=Math.max(0,(e.attack||0)-dt);
 e.lunge=Math.max(0,(e.lunge||0)-dt);
 if(e.windup>0){
   e.windup=Math.max(0,e.windup-dt);
   if(e.windup>0)return {action:'warn',kind:e.windupKind};
   const kind=e.windupKind;e.windupKind='';
   e.attack=ENEMY_TELLS[e.type]?.cooldown||1.4;
   if(kind==='spit')return {action:visible&&gap<9?'shoot':'miss',kind};
   if(kind==='volley')return {action:visible&&gap<11?'volley':'miss',kind};
   if(kind==='drain')return {action:visible&&gap<4?'drain':'miss',kind};
   if(kind==='charge'){
     e.lunge=.37;
     const n=Math.hypot(e.intentX-x,e.intentZ-z)||1;
     e.lungeX=(e.intentX-x)/n;e.lungeZ=(e.intentZ-z)/n;
     return {action:'charge',kind};
   }
   if(kind==='bite')return {action:gap<.96?'bite':'miss',kind};
   return {action:'miss',kind};
 }
 if(e.lunge>0)return {action:'lunge',kind:'charge'};
 if(e.attack>0||!visible)return {action:'approach'};
 let kind='';
 if(e.type==='crawler'&&gap<1.15)kind='bite';
 if(e.type==='brute'&&gap<4.8&&gap>1.05)kind='charge';
 if(e.type==='brute'&&gap<=1.05)kind='bite';
 if(e.type==='spitter'&&gap>=1.7&&gap<8)kind='spit';
 if(e.type==='spitter'&&gap<.85)kind='bite';
 if(e.type==='heart'&&gap<10)kind='volley';
 if(e.type==='leech'&&gap<3.6)kind='drain';
 if(!kind)return {action:'approach'};
 e.windup=kind==='bite'?.40:ENEMY_TELLS[e.type].windup;
 e.windupKind=kind;e.intentX=playerX;e.intentZ=playerZ;
 return {action:'warn',kind};
}
export function enemyTerrainReaction(type,hazard){
 if(hazard==='acid')return type==='spitter'?{damage:0,speed:1.15,stagger:0}:{damage:6,speed:.92,stagger:.06};
 if(hazard==='marrow')return type==='brute'?{damage:0,speed:1,stagger:0}:{damage:0,speed:.7,stagger:0};
 if(hazard==='charge')return type==='heart'?{damage:0,speed:1,stagger:0}:{damage:8,speed:.63,stagger:.48};
 return {damage:0,speed:1,stagger:0};
}
export function chooseEnemyKind(wave,roll){
 const r=cap(Number.isFinite(roll)?roll:0,0,.999999);
 if(wave===5)return 'heart';
 const heavy=wave===3?.38:wave===4?.25:.17;
 const siphon=wave===2||wave===4?.20:.12;
 if(r<heavy)return 'brute';
 if(r<heavy+siphon)return 'leech';
 if(r<heavy+siphon+.26)return 'spitter';
 return 'crawler';
}
export function maxActiveAttackers(enemies){
 return cap(3+Math.floor((enemies?.length||0)/8),3,5);
}
export function telegraphSeverity(e){
 if(!e?.windupKind||e.windup<=0)return 0;
 const initial=e.windupKind==='bite'?.4:ENEMY_TELLS[e.type]?.windup||1;
 return cap(1-e.windup/initial,0,1);
}
