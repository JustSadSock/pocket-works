function lineOfSightFrom(origin,x,y,z){
  const dx=x-origin.x,dy=y-origin.y,dz=z-origin.z,dist=Math.hypot(dx,dy,dz);
  if(dist<.2)return true;
  const sx=dx/dist,sy=dy/dist,sz=dz/dist;
  for(let d=.25;d<dist-.55;d+=.24){const id=getBlock(Math.floor(origin.x+sx*d),Math.floor(origin.y+sy*d),Math.floor(origin.z+sz*d));if(isSolid(id))return false;}
  return true;
}
function lineOfSightTo(x,y,z){return lineOfSightFrom({x:player.x,y:player.y+(player.crouching?1.28:EYE_HEIGHT),z:player.z},x,y,z);}
function findEntityTarget(maxDistance=5.5){
  const {forward}=cameraVectors();
  const oy=player.y+(player.crouching?1.28:EYE_HEIGHT);
  let best=null,bestT=maxDistance;
  for(const e of entities){
    if(e.dead)continue;
    const dx=e.x-player.x,dy=e.y+.68-oy,dz=e.z-player.z;
    const t=dx*forward[0]+dy*forward[1]+dz*forward[2];
    if(t<.1||t>=bestT)continue;
    const perp=dx*dx+dy*dy+dz*dz-t*t;
    const radius=e.type==='chicken'?.34:.58;
    if(perp<radius*radius&&lineOfSightTo(e.x,e.y+.65,e.z)){best=e;bestT=t;}
  }
  return best?{entity:best,distance:bestT}:null;
}
function hitEntity(e){
  if(!e||e.dead||hitCooldown>0)return;
  hitCooldown=.42;e.health-=3;e.hurt=.26;e.flee=3.5;
  e.targetYaw=Math.atan2(e.x-player.x,e.z-player.z);
  spawnParticles(e.x,e.y+.8,e.z,ENTITY_TYPES[e.type].body,12,.95);
  swingHand();pulseHaptic(22);playTone('hit');
  if(e.health<=0){e.dead=true;e.hurt=.7;e.deathTimer=.7;spawnParticles(e.x,e.y+.7,e.z,'#e9e4d7',24,1.45);supplies.meat+=e.type==='chicken'?1:2;buildInventory();scheduleSave();showToast(`Получен провиант: ${supplies.meat}`);}
  else showToast(`${ENTITY_TYPES[e.type].name}: ${Math.max(0,e.health)}/${e.maxHealth}`);
}
function spawnParticles(x,y,z,color,count=12,power=.8){
  for(let i=0;i<count;i++)particles.push({x:x+(Math.random()-.5)*.6,y:y+(Math.random()-.5)*.5,z:z+(Math.random()-.5)*.6,vx:(Math.random()-.5)*power,vy:(.35+Math.random())*power,vz:(Math.random()-.5)*power,life:.45+Math.random()*.45,maxLife:1,color,size:.035+Math.random()*.07});
  if(particles.length>90)particles.splice(0,particles.length-90);
}
function updateParticles(dt){
  for(const p of particles){p.life-=dt;p.vy-=5.6*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;}
  particles=particles.filter(p=>p.life>0);
}
function shadeHex(hex,factor){
  const n=parseInt(hex.slice(1),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  return `rgb(${Math.round(r*factor)},${Math.round(g*factor)},${Math.round(b*factor)})`;
}
function projectPoint(point,camera){
  const rx=point[0]-camera.x,ry=point[1]-camera.y,rz=point[2]-camera.z;
  const cx=rx*camera.vectors.right[0]+ry*camera.vectors.right[1]+rz*camera.vectors.right[2];
  const cy=rx*camera.vectors.up[0]+ry*camera.vectors.up[1]+rz*camera.vectors.up[2];
  const cz=rx*camera.vectors.forward[0]+ry*camera.vectors.forward[1]+rz*camera.vectors.forward[2];
  if(cz<=.08)return null;
  const scale=innerHeight/(2*(camera.fov||.72));
  return {x:innerWidth*.5+cx/cz*scale,y:innerHeight*.5-cy/cz*scale,z:cz};
}
function modelParts(e,now){
  const s=ENTITY_TYPES[e.type].scale,step=Math.sin(e.walk)*.09,parts=[];
  const add=(x,y,z,w,h,d,color,shade=1)=>parts.push({x:x*s,y:y*s,z:z*s,w:w*s,h:h*s,d:d*s,color,shade});
  if(e.type==='chicken'){
    add(0,.48,0,.62,.55,.58,'#e8e6da');add(0,.83,.28,.43,.43,.4,'#f2f0e6');add(0,.82,.52,.28,.16,.19,'#cf8e36');add(-.18,.17,step,.09,.34,.09,'#b9853f');add(.18,.17,-step,.09,.34,.09,'#b9853f');
  }else{
    const c=ENTITY_TYPES[e.type];add(0,.72,0,1.18,.7,.58,c.body);
    add(0,.76,.53,e.type==='cow'?.53:.46,e.type==='cow'?.57:.49,e.type==='cow'?.48:.44,c.head);
    const legY=.27;
    add(-.38,legY,-.2+step,.16,.54,.16,c.leg);add(.38,legY,-.2-step,.16,.54,.16,c.leg);add(-.38,legY,.2-step,.16,.54,.16,c.leg);add(.38,legY,.2+step,.16,.54,.16,c.leg);
    if(e.type==='cow'){add(-.23,1.08,.61,.13,.12,.26,'#d8c69c');add(.23,1.08,.61,.13,.12,.26,'#d8c69c');}
  }
  return parts;
}
const BOX_FACES=[[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[1,5,7,3],[0,2,6,4]];
const FACE_SHADE=[.64,1.04,.78,.9,.84,.7];
function drawCuboid(part,e,camera,light){
  const cx=Math.cos(e.yaw),sx=Math.sin(e.yaw),verts=[];
  for(const [dx,dy,dz] of [[-.5,-.5,-.5],[.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[-.5,-.5,.5],[.5,-.5,.5],[-.5,.5,.5],[.5,.5,.5]]){
    const lx=part.x+dx*part.w,lz=part.z+dz*part.d;
    const wx=e.x+lx*cx+lz*sx,wz=e.z-lx*sx+lz*cx,wy=e.y+part.y+dy*part.h;
    verts.push(projectPoint([wx,wy,wz],camera));
  }
  if(verts.every(v=>!v))return;
  const faces=[];
  BOX_FACES.forEach((indices,fi)=>{const points=indices.map(i=>verts[i]);if(points.some(v=>!v))return;faces.push({points,depth:points.reduce((a,v)=>a+v.z,0)/4,fi});});
  faces.sort((a,b)=>b.depth-a.depth);
  for(const face of faces){
    entityCtx.beginPath();face.points.forEach((v,i)=>i?entityCtx.lineTo(v.x,v.y):entityCtx.moveTo(v.x,v.y));entityCtx.closePath();
    const hurt=e.hurt>0&&Math.floor(performance.now()/55)%2===0;
    entityCtx.fillStyle=hurt?'#f3b2ac':shadeHex(part.color,FACE_SHADE[face.fi]*(.35+.65*light));entityCtx.fill();
    entityCtx.strokeStyle='rgba(25,22,18,.48)';entityCtx.lineWidth=Math.max(1,2.2/Math.max(.65,face.depth*.08));entityCtx.stroke();
  }
}
function renderLivingWorld(now,camera){
  entityCtx.clearRect(0,0,innerWidth,innerHeight);
  const visible=entities.filter(e=>!e.dead&&Math.hypot(e.x-camera.x,e.y-camera.y,e.z-camera.z)<settings.distance&&lineOfSightFrom(camera,e.x,e.y+.65,e.z)).sort((a,b)=>Math.hypot(b.x-camera.x,b.z-camera.z)-Math.hypot(a.x-camera.x,a.z-camera.z));
  for(const e of visible)for(const part of modelParts(e,now))drawCuboid(part,e,camera,camera.daylight);
  for(const p of particles){const q=projectPoint([p.x,p.y,p.z],camera);if(!q)continue;const size=clamp(p.size*innerHeight/q.z*2,2,16);entityCtx.globalAlpha=clamp(p.life/.3,0,1);entityCtx.fillStyle=p.color;entityCtx.fillRect(Math.round(q.x-size/2),Math.round(q.y-size/2),Math.ceil(size),Math.ceil(size));}
  entityCtx.globalAlpha=1;
  if(entityTarget){const q=projectPoint([entityTarget.entity.x,entityTarget.entity.y+.75,entityTarget.entity.z],camera);if(q){entityCtx.strokeStyle='rgba(255,255,255,.82)';entityCtx.lineWidth=2;const r=clamp(innerHeight/q.z*.38,12,58);entityCtx.strokeRect(q.x-r,q.y-r,r*2,r*2);}}
}

