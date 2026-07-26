function collidesAt(x,y,z) {
  const minX=Math.floor(x-PLAYER_RADIUS), maxX=Math.floor(x+PLAYER_RADIUS);
  const minY=Math.floor(y), maxY=Math.floor(y+PLAYER_HEIGHT-.01);
  const minZ=Math.floor(z-PLAYER_RADIUS), maxZ=Math.floor(z+PLAYER_RADIUS);
  for (let by=minY;by<=maxY;by++) for (let bz=minZ;bz<=maxZ;bz++) for (let bx=minX;bx<=maxX;bx++) {
    if (bx<0||bz<0||bx>=WORLD_X||bz>=WORLD_Z||by<0) return true;
    if (by<WORLD_Y && isSolid(getBlock(bx,by,bz))) return true;
  }
  return false;
}
function collidesEntityAt(x,y,z){
  return entities.some(e=>!e.dead&&Math.abs((y+PLAYER_HEIGHT*.5)-(e.y+.55))<1.15&&Math.hypot(x-e.x,z-e.z)<(e.type==='chicken'?.43:.62));
}
function moveAxis(axis,amount) {
  if (!amount) return false;
  const steps=Math.max(1,Math.ceil(Math.abs(amount)/.18));
  const step=amount/steps;
  let collided=false;
  for (let i=0;i<steps;i++) {
    const nx=axis==='x'?player.x+step:player.x;
    const ny=axis==='y'?player.y+step:player.y;
    const nz=axis==='z'?player.z+step:player.z;
    const horizontal=axis==='x'||axis==='z';
    const unsafeSneak=horizontal&&player.crouching&&player.grounded&&!collidesAt(nx,player.y-.075,nz);
    const entityBlocked=horizontal&&collidesEntityAt(nx,ny,nz);
    if (!collidesAt(nx,ny,nz)&&!unsafeSneak&&!entityBlocked) { player.x=nx; player.y=ny; player.z=nz; }
    else {
      collided=true;
      if (axis==='x') player.vx=0;
      if (axis==='y') player.vy=0;
      if (axis==='z') player.vz=0;
      break;
    }
  }
  return collided;
}
function blockAtBody(id=5) {
  const eye=player.y+(player.crouching?1.28:EYE_HEIGHT);
  const points=[[player.x,player.y+.15,player.z],[player.x,player.y+1.0,player.z],[player.x,eye,player.z]];
  return points.some(([x,y,z])=>getBlock(Math.floor(x),Math.floor(y),Math.floor(z))===id);
}
function headInWater(){
  const eye=player.y+(player.crouching?1.28:EYE_HEIGHT);
  return getBlock(Math.floor(player.x),Math.floor(eye),Math.floor(player.z))===5;
}
function damagePlayer(amount,reason='урон'){
  if(amount<=0||mode!=='game')return;
  player.health=clamp(player.health-amount,0,20);
  $('#damageFlash').classList.remove('flash');void $('#damageFlash').offsetWidth;$('#damageFlash').classList.add('flash');
  pulseHaptic(Math.min(80,18+amount*5));playTone('hurt');updateVitalsHud();
  if(player.health<=0){
    showToast(`Ты погиб: ${reason}`);
    setTimeout(()=>respawn(true),260);
  }
}
function updateSurvival(dt,moving){
  survivalTick+=dt;if(survivalTick>=15){survivalTick=0;saveWorld();}
  worldTime+=dt/720;
  if(worldTime>=1){worldTime-=1;worldDay++;showToast(`Наступил день ${worldDay}`);}
  const drain=player.sprinting&&moving?.018:(moving?.005:.0012);
  player.hunger=clamp(player.hunger-drain*dt,0,20);
  if(headInWater()){
    player.air=clamp(player.air-dt*1.55,0,10);
    if(player.air<=0){drowningTick+=dt;if(drowningTick>=1){drowningTick=0;damagePlayer(2,'не хватило воздуха');}}
  }else{player.air=clamp(player.air+dt*4.3,0,10);drowningTick=0;}
  regenerationTick+=dt;
  if(player.health<20&&player.hunger>15&&regenerationTick>=4){regenerationTick=0;player.health=Math.min(20,player.health+1);player.hunger=Math.max(0,player.hunger-.3);playTone('heal');}
  if(player.hunger<=0&&regenerationTick>=4){regenerationTick=0;if(player.health>1)damagePlayer(1,'голод');}
  updateVitalsHud();
}
function updatePhysics(dt,now) {
  const keyX=(controls.keys.has('KeyD')||controls.keys.has('ArrowRight')?1:0)-(controls.keys.has('KeyA')||controls.keys.has('ArrowLeft')?1:0);
  const keyY=(controls.keys.has('KeyW')||controls.keys.has('ArrowUp')?1:0)-(controls.keys.has('KeyS')||controls.keys.has('ArrowDown')?1:0);
  let mx=clamp(controls.joyX+keyX,-1,1), my=clamp(-controls.joyY+keyY,-1,1);
  const len=Math.hypot(mx,my); if (len>1) {mx/=len;my/=len;}
  player.underwater=blockAtBody(5);
  if(my<.35||player.crouching||player.hunger<2)player.sprinting=false;
  if(controls.keys.has('ShiftLeft')&&my>.4&&!player.crouching&&player.hunger>=2)player.sprinting=true;
  const speed=player.underwater?2.7:(player.crouching?1.65:(player.sprinting?6.25:4.4));
  const sy=Math.sin(player.yaw), cy=Math.cos(player.yaw);
  const targetVx=(cy*mx+sy*my)*speed;
  const targetVz=(-sy*mx+cy*my)*speed;
  const accel=1-Math.exp(-(player.grounded?14:player.underwater?8:4.5)*dt);
  player.vx=lerp(player.vx,targetVx,accel); player.vz=lerp(player.vz,targetVz,accel);
  player.grounded=collidesAt(player.x,player.y-.055,player.z);
  if (player.underwater) {
    player.vy += (player.jumpHeld||controls.keys.has('Space') ? 8.2 : 3.2)*dt;
    player.vy -= 5.2*dt;
    player.vy*=Math.pow(.18,dt);
  } else {
    if ((player.jumpHeld||controls.keys.has('Space')) && player.grounded&&!player.crouching) {
      player.vy=6.6; player.grounded=false;player.hunger=Math.max(0,player.hunger-.025);pulseHaptic(15);playTone('jump');
    }
    player.vy-=18.5*dt;
  }
  moveAxis('x',player.vx*dt); moveAxis('z',player.vz*dt);
  const impactSpeed=player.vy;
  const hitVertical=moveAxis('y',player.vy*dt);
  if(hitVertical&&impactSpeed<-10.2&&!player.underwater){damagePlayer(Math.max(1,Math.floor((-impactSpeed-9.2)*1.15)),'падение');}
  if (player.y<1 || !Number.isFinite(player.y)) respawn(true);
  const moving=Math.hypot(player.vx,player.vz)>.65;
  if(moving&&player.grounded)player.walkPhase+=dt*(player.sprinting?13.5:9.2);
  if (moving&&player.grounded&&now-lastStepSound>(player.sprinting?265:390)) { lastStepSound=now; playTone('step'); }
  updateSurvival(dt,moving);
  underwaterEl.classList.toggle('active',player.underwater);
  sprintVignette.classList.toggle('active',player.sprinting&&moving);
}
function respawn(resetVitals=false) {
  Object.assign(player,{...generatedSpawn,vx:0,vy:0,vz:0,pitch:-.08,crouching:false,sprinting:false});
  if(resetVitals){player.health=20;player.hunger=Math.max(12,player.hunger);player.air=10;}
  $('#crouchButton').classList.remove('active');
  updateVitalsHud();
  showToast('Возвращение на поверхность');
}
