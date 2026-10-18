// Defensive saved-session migration and swept collisions; independent of DOM / WebGL.
const num=(value,min,max,fallback=0)=>Number.isFinite(value)?Math.min(max,Math.max(min,value)):fallback;
const kinds=new Set(['crawler','spitter','brute','heart']);
const validPosition=e=>e&&Number.isFinite(e.x)&&Number.isFinite(e.z)&&Math.abs(e.x)<=10000&&Math.abs(e.z)<=10000;
export function validateRun(s){
  if(!s||typeof s!=='object'||![1,2].includes(s.v)||!Number.isInteger(s.seed)||s.seed<0||s.seed>4294967295||!validPosition(s)||!Number.isFinite(s.hp)||s.hp<=0)return null;
  const maxHp=num(s.maxHp,1,100,100),hp=num(s.hp,0,maxHp,100);
  if(hp<=0)return null;
  return {
    v:2,seed:s.seed>>>0,x:s.x,z:s.z,
    yaw:num(s.yaw,-100000,100000,Math.PI/2),pitch:num(s.pitch,-1.24,1.24,0),
    hp,maxHp,heat:0,weapon:s.weapon===1?1:0,
    level:num(Math.floor(s.level),0,8,0),damageBonus:num(s.damageBonus,0,250,0),
    cooldown:0,dashCooldown:num(s.dashCooldown,0,2.7,0),dashTime:0,dashDirX:0,dashDirZ:0,invuln:1,
    score:num(Math.floor(s.score),0,100000000,0),kills:num(Math.floor(s.kills),0,1000000,0),
    wave:num(Math.floor(s.wave),1,5,1),elapsed:num(s.elapsed,0,10000000,0),
    waveTime:num(s.waveTime,0,1000000,0),toSpawn:num(Math.floor(s.toSpawn),0,40,0),
    spawnClock:num(s.spawnClock,0,30,0),
    enemies:(Array.isArray(s.enemies)?s.enemies:[]).filter(e=>validPosition(e)&&kinds.has(e.type)&&Number.isFinite(e.hp)&&e.hp>0).slice(0,28).map(e=>({type:e.type,x:e.x,z:e.z,hp:num(e.hp,1,500,1)})),
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
