// Defensive saved-session migration and swept collisions; independent of DOM / WebGL.
import {sanitizeGrafts,maxWeaponIndex} from './biobuilds.js';
import {sanitizeImmune} from './immunity.js';
import {ROUTES,GENES,routeOptions,sanitizeRouteHistory} from './runPaths.js';
import {GUARDIAN_TYPES,guardianForWave,sanitizeGuardianPending} from './guardians.js';
import {pulsePlan} from './runPacing.js';
const num=(value,min,max,fallback=0)=>Number.isFinite(value)?Math.min(max,Math.max(min,value)):fallback;
const kinds=new Set(['crawler','spitter','brute','heart','leech','warden',...GUARDIAN_TYPES]);
const validPosition=e=>e&&Number.isFinite(e.x)&&Number.isFinite(e.z)&&Math.abs(e.x)<=10000&&Math.abs(e.z)<=10000;
export function validateRun(s){
  if(!s||typeof s!=='object'||![1,2,3,4,5].includes(s.v)||!Number.isInteger(s.seed)||s.seed<0||s.seed>4294967295||!validPosition(s)||!Number.isFinite(s.hp)||s.hp<=0)return null;
  const maxHp=num(s.maxHp,1,160,100),hp=num(s.hp,0,maxHp,100);
  if(hp<=0)return null;
  return {
    v:5,seed:s.seed>>>0,x:s.x,z:s.z,
    // Missing pacing fields identify legacy saves: never triple their remaining run.
    pulseMax:s.pulseMax===3?3:1,
    pulse:s.pulseMax===3&&pulsePlan(s.seed,Math.floor(s.wave),Math.floor(s.pulse))?Math.floor(s.pulse):1,
    pulseSpawned:num(Math.floor(s.pulseSpawned),0,40,0),
    organRuptureClaimed:s.organRuptureClaimed===true,
    guardianDefeated:Array.isArray(s.guardianDefeated)?[...new Set(s.guardianDefeated.filter(v=>Number.isInteger(v)&&!!guardianForWave(v)))].sort():[],
    guardianPending:Array.isArray(s.guardianDefeated)&&s.guardianDefeated.includes(s.wave)?0:
      sanitizeGuardianPending(s.guardianPending,s.wave),
    routeHistory:sanitizeRouteHistory(s.routeHistory),
    selectedRoute:(Number.isInteger(s.pendingDraft)&&s.pendingDraft>=2&&s.pendingDraft<=5?
      s.pendingDraft:Math.min(5,Math.max(2,(Math.floor(s.wave)||1)+1)))<=5&&
      (Math.floor(s.wave)||1)<5&&routeOptions(s.seed,Number.isInteger(s.pendingDraft)&&s.pendingDraft>=2&&s.pendingDraft<=5?
      s.pendingDraft:Math.min(5,(Math.floor(s.wave)||1)+1)).some(r=>r.id===s.selectedRoute)?s.selectedRoute:'',
    routeId:Number.isInteger(s.routeWave)&&s.routeWave===Math.floor(s.wave)&&ROUTES.some(r=>r.id===s.routeId)?s.routeId:'',
    routeWave:Number.isInteger(s.routeWave)&&s.routeWave===Math.floor(s.wave)&&ROUTES.some(r=>r.id===s.routeId)?s.routeWave:0,
    routeHazard:Number.isInteger(s.routeWave)&&s.routeWave===Math.floor(s.wave)&&s.routeId==='necrosis'?4:0,
    gene:GENES.some(g=>g.id===s.gene)?s.gene:null,
    immune:sanitizeImmune(s.immune),grafts:sanitizeGrafts(s.grafts),biomass:num(Math.floor(s.biomass),0,99,0),
    pendingDraft:Number.isInteger(s.pendingDraft)&&s.pendingDraft>=2&&s.pendingDraft<=5&&s.pendingDraft===(Math.floor(s.wave)||1)+1?s.pendingDraft:0,
    draftRevision:num(Math.floor(s.draftRevision),0,100,0),
    ruptured:(Array.isArray(s.ruptured)?s.ruptured:[])
      .filter(id=>typeof id==='string'&&id.length<=29&&/^(?:[1-5]:)?-?\d+,-?\d+$/.test(id))
      .slice(0,2000).map(id=>id.includes(':')?id:(num(Math.floor(s.wave),1,5,1)+':'+id))
      .filter((id,i,a)=>a.indexOf(id)===i),
    ruptureCount:num(Math.floor(s.ruptureCount),0,2000,0),immuneHeat:num(s.immuneHeat,0,100,0),immuneDelay:num(s.immuneDelay,0,6,0),hazardCooldown:num(s.hazardCooldown,0,3,0),
    yaw:num(s.yaw,-100000,100000,Math.PI/2),pitch:num(s.pitch,-1.24,1.24,0),
    hp,maxHp,heat:0,weapon:Number.isInteger(s.weapon)&&s.weapon>=0&&s.weapon<=maxWeaponIndex(s)?s.weapon:0,
    level:num(Math.floor(s.level),0,8,0),damageBonus:num(s.damageBonus,0,250,0),
    cooldown:0,dashCooldown:num(s.dashCooldown,0,4.1,0),dashTime:0,dashDirX:0,dashDirZ:0,invuln:1,
    score:num(Math.floor(s.score),0,100000000,0),kills:num(Math.floor(s.kills),0,1000000,0),
    wave:num(Math.floor(s.wave),1,5,1),elapsed:num(s.elapsed,0,10000000,0),
    waveTime:num(s.waveTime,0,1000000,0),toSpawn:num(Math.floor(s.toSpawn),0,40,0),
    spawnClock:num(s.spawnClock,0,30,0),
    enemies:(Array.isArray(s.enemies)?s.enemies:[]).filter(e=>validPosition(e)&&kinds.has(e.type)&&Number.isFinite(e.hp)&&e.hp>0).slice(0,28).map(e=>({type:e.type,x:e.x,z:e.z,hp:num(e.hp,1,500,1),...(e.type==='ossuary'?{facing:num(e.facing,-100000,100000,0)}:{})})),
    pickups:(Array.isArray(s.pickups)?s.pickups:[]).filter(validPosition).slice(0,30).map(p=>({x:p.x,z:p.z,type:p.type==='heal'?'heal':'fragment'})),
    projectiles:[],moving:0,sprinting:false,heartPhase:num(Math.floor(s.heartPhase),1,3,1),phase:0
  };
}
export function sweepCircle(x,z,dx,dz,r,isFloor){
  if(![x,z,dx,dz,r].every(Number.isFinite)||r<=0)return {x,z};
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12));
  const sx=dx/steps,sz=dz/steps;
  const walkable=(a,b)=>isFloor(a-r,b-r)&&isFloor(a+r,b-r)&&isFloor(a-r,b+r)&&isFloor(a+r,b+r);
  for(let i=0;i<steps;i++){
    if(walkable(x+sx,z))x+=sx;
    if(walkable(x,z+sz))z+=sz;
  }
  return {x,z};
}
export function deadzone(v,threshold=.16){
  if(!Number.isFinite(v))return 0;
  const a=Math.abs(v);return a<=threshold?0:Math.sign(v)*Math.min(1,(a-threshold)/(1-threshold));
}

// Pick an actual traversable sightline rather than spawning the camera into a wall.
// The full collision footprint is tested, not just the cell center.
export function findOpenFacing(x,z,isFloor){
  let chosen=Math.PI/2,reach=-1;
  for(let i=0;i<24;i++){
    const yaw=i*Math.PI/12,dx=-Math.sin(yaw),dz=-Math.cos(yaw);
    let distance=0;
    for(let d=.25;d<=6;d+=.25){
      const a=x+dx*d,b=z+dz*d,r=.21;
      if(!(isFloor(a-r,b-r)&&isFloor(a+r,b-r)&&isFloor(a-r,b+r)&&isFloor(a+r,b+r)))break;
      distance=d;
    }
    if(distance>reach){reach=distance;chosen=yaw;}
  }
  return chosen;
}
