function loadJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch { return fallback; }
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a,b,t) { return a + (b-a)*t; }
function smoothstep(t) { return t*t*(3-2*t); }
function hashInt(x,z,s=seed) {
  let n = (Math.imul(x,374761393) + Math.imul(z,668265263) + Math.imul(s,69069)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function hash3(x,y,z,s=seed) {
  let n = Math.imul(x,73856093) ^ Math.imul(y,19349663) ^ Math.imul(z,83492791) ^ Math.imul(s,2654435761);
  n = Math.imul(n ^ (n >>> 15), 2246822519);
  return ((n ^ (n >>> 13)) >>> 0) / 4294967295;
}
function noise2(x,z) {
  const x0=Math.floor(x), z0=Math.floor(z), tx=smoothstep(x-x0), tz=smoothstep(z-z0);
  const a=hashInt(x0,z0), b=hashInt(x0+1,z0), c=hashInt(x0,z0+1), d=hashInt(x0+1,z0+1);
  return lerp(lerp(a,b,tx),lerp(c,d,tx),tz);
}
function noise3(x,y,z) {
  const x0=Math.floor(x), y0=Math.floor(y), z0=Math.floor(z);
  const tx=smoothstep(x-x0), ty=smoothstep(y-y0), tz=smoothstep(z-z0);
  const at=(ix,iy,iz)=>hash3(x0+ix,y0+iy,z0+iz);
  const x00=lerp(at(0,0,0),at(1,0,0),tx), x10=lerp(at(0,1,0),at(1,1,0),tx);
  const x01=lerp(at(0,0,1),at(1,0,1),tx), x11=lerp(at(0,1,1),at(1,1,1),tx);
  return lerp(lerp(x00,x10,ty),lerp(x01,x11,ty),tz);
}
function indexOf(x,y,z) { return x + y*WORLD_X + z*WORLD_X*WORLD_Y; }
function inWorld(x,y,z) { return x>=0 && y>=0 && z>=0 && x<WORLD_X && y<WORLD_Y && z<WORLD_Z; }
function getBlock(x,y,z) {
  if (!inWorld(x,y,z)) return y < 0 ? 3 : 0;
  return world[indexOf(x,y,z)];
}
function setBlockRaw(x,y,z,id) {
  if (!inWorld(x,y,z)) return;
  world[indexOf(x,y,z)] = id;
}
function isSolid(id) { return id !== 0 && id !== 5; }
function topSolid(x,z) {
  for (let y=WORLD_Y-2; y>=0; y--) if (isSolid(getBlock(x,y,z))) return y;
  return 0;
}
function findSafeSpawn(cx=Math.floor(WORLD_X/2),cz=Math.floor(WORLD_Z/2)){
  for(let r=0;r<Math.max(WORLD_X,WORLD_Z)/2;r++){
    for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
      if(r>0&&Math.abs(dx)!==r&&Math.abs(dz)!==r)continue;
      const x=cx+dx,z=cz+dz;if(x<2||z<2||x>=WORLD_X-2||z>=WORLD_Z-2)continue;
      const y=topSolid(x,z),ground=getBlock(x,y,z);
      if((ground===1||ground===4)&&getBlock(x,y+1,z)===0&&getBlock(x,y+2,z)===0)return{x:x+.5,y:y+1.05,z:z+.5};
    }
  }
  return{x:WORLD_X/2+.5,y:WORLD_Y-4,z:WORLD_Z/2+.5};
}

const ENTITY_TYPES = {
  sheep:{name:'Овца',body:'#dedbd1',head:'#b9b7ad',leg:'#3d3935',health:8,scale:1},
  pig:{name:'Свинья',body:'#d98d88',head:'#e79e98',leg:'#b76f70',health:10,scale:.92},
  cow:{name:'Корова',body:'#75513d',head:'#654331',leg:'#3d2a22',health:14,scale:1.08},
  chicken:{name:'Курица',body:'#e8e6da',head:'#f2f0e6',leg:'#b9853f',health:4,scale:.68}
};
function spawnEntities() {
  entities=[];
  const kinds=['sheep','pig','cow','chicken','sheep','pig','chicken','cow','sheep','pig'];
  for(let i=0;i<kinds.length;i++){
    let placed=false;
    for(let attempt=0;attempt<40&&!placed;attempt++){
      const x=4+Math.floor(hashInt(i*53+attempt*7,seed+i*19)*(WORLD_X-8));
      const z=4+Math.floor(hashInt(seed-i*31,attempt*43+i)*(WORLD_Z-8));
      const y=topSolid(x,z);
      if(getBlock(x,y,z)!==1||getBlock(x,y+1,z)!==0||Math.hypot(x-generatedSpawn.x,z-generatedSpawn.z)<4)continue;
      const type=kinds[i],spec=ENTITY_TYPES[type];
      entities.push({id:`${type}-${i}`,type,x:x+.5,y:y+1,z:z+.5,yaw:hashInt(x,z)*Math.PI*2,targetYaw:hashInt(z,x)*Math.PI*2,speed:.25+hashInt(x*2,z*3)*.34,think:1+hashInt(x*5,z*7)*4,walk:hashInt(x*11,z*13)*20,health:spec.health,maxHealth:spec.health,hurt:0,flee:0,dead:false});
      placed=true;
    }
  }
}
function shortestAngle(a,b){return Math.atan2(Math.sin(b-a),Math.cos(b-a));}
function updateEntities(dt){
  hitCooldown=Math.max(0,hitCooldown-dt);
  for(const e of entities){
    if(e.dead){e.deathTimer=(e.deathTimer??.7)-dt;continue;}
    e.hurt=Math.max(0,e.hurt-dt);
    e.flee=Math.max(0,e.flee-dt);
    e.think-=dt;
    if(e.think<=0){
      e.think=1.4+hashInt(Math.floor(e.x*11+performance.now()*.001),Math.floor(e.z*7))*4.2;
      e.targetYaw+= (hashInt(Math.floor(e.x*17),Math.floor(e.z*23+e.think*9))-.5)*Math.PI*1.8;
      e.speed=.16+hashInt(Math.floor(e.x*31),Math.floor(e.z*29))* .48;
    }
    const playerDistance=Math.hypot(e.x-player.x,e.z-player.z);
    if(e.flee>0||playerDistance<1.15){
      e.targetYaw=Math.atan2(e.x-player.x,e.z-player.z);
      e.speed=e.flee>0?1.75:.95;
    }
    e.yaw+=shortestAngle(e.yaw,e.targetYaw)*Math.min(1,dt*3.4);
    const speed=e.speed*(worldTime<.22||worldTime>.82?.42:1);
    const nx=e.x+Math.sin(e.yaw)*speed*dt, nz=e.z+Math.cos(e.yaw)*speed*dt;
    const gx=Math.floor(nx),gz=Math.floor(nz),ground=topSolid(gx,gz),block=getBlock(gx,ground,gz);
    const blocked=nx<2||nz<2||nx>WORLD_X-2||nz>WORLD_Z-2||block===4||block===5||Math.abs((ground+1)-e.y)>1.05||isSolid(getBlock(gx,ground+2,gz));
    if(blocked){e.targetYaw+=Math.PI*(.65+hashInt(gx,gz)*.7);e.think=.2;}
    else{e.x=nx;e.z=nz;e.y=lerp(e.y,ground+1,Math.min(1,dt*8));e.walk+=speed*dt*7;}
  }
  entities=entities.filter(e=>!e.dead||(e.deathTimer??.7)>0);
}
