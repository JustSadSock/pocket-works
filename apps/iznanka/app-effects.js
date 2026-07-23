function updateProjectiles(dt) {
  for(const p of runtime.projectiles){
    p.life-=dt;
    if(p.life<=0) continue;
    p.x+=p.vx*dt; p.y+=p.vy*dt;
    if(isBlocked(runtime.zone.id,p.layer,p.x,p.y,p.radius)){p.life=0;spawnBurst(p.x,p.y,p.owner==='player'?'#e8dfbf':'#8c7d91',4);continue;}
    if(p.layer!==runtime.save.layer) continue;
    if(p.owner==='player'){
      for(const e of runtime.enemies){
        if(e.dead||!isEnemyVisible(e)||distance(p,e)>p.radius+e.radius) continue;
        applyHit(e,p.damage,p.kind==='needle'?'skill':'attack'); p.pierce--; if(p.pierce<=0){p.life=0;break;}
      }
    } else if(!player.dead&&Math.hypot(p.x-player.x,p.y-player.y)<p.radius+player.radius){
      hurtPlayer(p.damage,null); p.life=0;
    }
  }
  runtime.projectiles=runtime.projectiles.filter(p=>p.life>0);
}

function updateEffects(dt) {
  for(const p of runtime.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.96;p.vy*=.96;}
  runtime.particles=runtime.particles.filter(p=>p.life>0);
  for(const f of runtime.floaters){f.life-=dt;f.y-=22*dt;}
  runtime.floaters=runtime.floaters.filter(f=>f.life>0);
}

function spawnBurst(x,y,color,count=8) {
  const rng=seeded(hashString(`${x|0}:${y|0}:${runtime.frameCount}:${count}`));
  for(let i=0;i<count;i++){
    const a=rng()*Math.PI*2,s=18+rng()*70;
    runtime.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.25+rng()*.45,max:.7,color,size:1+Math.floor(rng()*3)});
  }
}
function spawnRing(x,y,color,life=.5,maxRadius=60){runtime.particles.push({x,y,vx:0,vy:0,life,max:life,color,size:2,ring:true,maxRadius});}
function spawnFloater(x,y,text,color='#fff',scale=1){runtime.floaters.push({x,y,text:String(text),color,life:.75,max:.75,scale});}

function updateCamera(dt) {
  const maxX=Math.max(0,runtime.zone.size[0]*TILE-VIEW.width);
  const maxY=Math.max(0,runtime.zone.size[1]*TILE-VIEW.height);
  const targetX=Math.max(0,Math.min(maxX,player.x-VIEW.width/2));
  const targetY=Math.max(0,Math.min(maxY,player.y-VIEW.height/2));
  const smoothing=1-Math.pow(.001,dt);
  camera.x+=(targetX-camera.x)*smoothing; camera.y+=(targetY-camera.y)*smoothing;
  camera.shake=Math.max(0,camera.shake-dt*20);
  if(camera.shake>0){camera.shakeX=(Math.random()-.5)*camera.shake;camera.shakeY=(Math.random()-.5)*camera.shake;}else{camera.shakeX=0;camera.shakeY=0;}
}

function update(dt) {
  runtime.frameCount++;
  runtime.renderTime+=dt*1000;
  runtime.shiftCooldown=Math.max(0,runtime.shiftCooldown-dt);
  runtime.skillCooldown=Math.max(0,runtime.skillCooldown-dt);
  runtime.dashCooldown=Math.max(0,runtime.dashCooldown-dt);
  runtime.attackCooldown=Math.max(0,runtime.attackCooldown-dt);
  runtime.comboWindow=Math.max(0,runtime.comboWindow-dt);
  runtime.save.playTime+=dt;
  runtime.save.stats.resolve=Math.min(runtime.save.stats.maxResolve,runtime.save.stats.resolve+runtime.save.stats.resolveRegen*dt);
  updatePlayer(dt); updateEnemies(dt); updateProjectiles(dt); updateEffects(dt); updateNearby(); updateCamera(dt);
  runtime.saveAccumulator+=dt;
  if(runtime.saveAccumulator>4){runtime.saveAccumulator=0;persistSave();updateHud();}
  attackButton.classList.toggle('cooldown',runtime.attackCooldown>0);
  skillButton.classList.toggle('cooldown',runtime.skillCooldown>0||runtime.save.stats.resolve<(runtime.save.world.talked['cheap-needle']?20:25));
  dashButton.classList.toggle('cooldown',runtime.dashCooldown>0);
  shiftButton.classList.toggle('cooldown',runtime.shiftCooldown>0);
}

