// MEAT.EXE v1.8.2 — anatomical guardians, not scaled copies of common mobs.
// Four organ-specific encounters, one after the third pulse in every organ.
// The gastric Warden already had unique geometry and charge telegraph, but was
// previously missing from the actual required boss progression.
export const ORGAN_GUARDIANS=Object.freeze({
  1:Object.freeze({type:'clot',name:'ТРОМБ-СТРАЖ',hp:145,speed:.82,score:700,kind:'pulse'}),
  2:Object.freeze({type:'warden',name:'ЖЕЛЧНЫЙ ПРИВРАТНИК',hp:245,speed:.76,score:950,kind:'charge'}),
  3:Object.freeze({type:'ossuary',name:'КОСТОГРЫЗ',hp:235,speed:.74,score:1100,kind:'shards'}),
  4:Object.freeze({type:'synapse',name:'СИНАПТИЧЕСКИЙ УЗЕЛ',hp:180,speed:1.07,score:1250,kind:'surge'})
});
export const GUARDIAN_TYPES=Object.freeze(Object.values(ORGAN_GUARDIANS).map(g=>g.type));
export const isGuardian=type=>GUARDIAN_TYPES.includes(type);
export const guardianForWave=wave=>ORGAN_GUARDIANS[wave]||null;
export function guardianReady(state){
 const kind=guardianForWave(state?.wave);
 return !!kind && state.guardianPending===state.wave && state.toSpawn===0 &&
   state.enemies.length<=2 && !state.enemies.some(e=>isGuardian(e.type));
}
export function guardianSpawnResolved(state,spawnSucceeded){
 if(!state||!guardianForWave(state.wave)||state.guardianPending!==state.wave)return false;
 if(spawnSucceeded){state.guardianPending=0;return true;}
 return false;
}
export function guardianDamage(enemy,baseDamage,playerX,playerZ){
 if(!Number.isFinite(baseDamage)||baseDamage<=0)return 0;
 if(enemy?.type!=='ossuary'||(enemy.windup||0)>0)return baseDamage;
 const dx=playerX-enemy.x,dz=playerZ-enemy.z,d=Math.hypot(dx,dz)||1;
 const facing=Number.isFinite(enemy.facing)?enemy.facing:0;
 const frontal=(dx*Math.sin(facing)+dz*Math.cos(facing))/d;
 return baseDamage*(frontal>.48?.27:1);
}
export function guardianAction(type,action,e,player){
 if(type==='clot'&&action==='pulse')
   return {kind:'pulse',hit:Math.hypot(player.x-e.x,player.z-e.z)<=2.65,damage:18};
 if(type==='synapse'&&action==='surge')
   return {kind:'surge',hit:Math.hypot(player.x-e.intentX,player.z-e.intentZ)<=1.12,damage:21};
 if(type==='ossuary'&&action==='shards')
   return {kind:'shards',angles:[-.39,-.19,0,.19,.39]};
 return null;
}
export function sanitizeGuardianPending(value,wave){
 return Number.isInteger(value)&&value===wave&&!!guardianForWave(wave)?value:0;
}
