function isEnemyVisible(enemy) {
  if(enemy.final&&!runtime.finalStarted) return false;
  return enemy.layer==='both'||enemy.layer===runtime.save.layer;
}

function updatePlayer(dt) {
  const mv=movementVector();
  if(player.dashing>0){
    player.dashing-=dt; tryMove(player,player.vx*dt,player.vy*dt); player.vx*=.92;player.vy*=.92;
    if(runtime.save.inventory.equipped.includes('paper-moon')&&runtime.save.layer===LAYERS.ASH&&runtime.frameCount%3===0){
      runtime.particles.push({x:player.x,y:player.y,vx:0,vy:0,life:.35,max:.35,color:'#d7c9f0',size:9,slash:true});
      for(const e of runtime.enemies) if(!e.dead&&isEnemyVisible(e)&&distance(player,e)<20) applyHit(e,6*runtime.save.stats.attack,'hazard');
    }
  } else {
    const speed=player.speed*(isHazard(runtime.zone.id,runtime.save.layer,player.x,player.y)?0.72:1);
    tryMove(player,mv.x*speed*dt,mv.y*speed*dt);
    if(Math.hypot(mv.x,mv.y)>.1){ player.facingX=mv.x;player.facingY=mv.y; }
  }
  if(isHazard(runtime.zone.id,runtime.save.layer,player.x,player.y)){
    runtime.hazardTick-=dt;
    if(runtime.hazardTick<=0){hurtPlayer(6,null);runtime.hazardTick=.8;}
  } else runtime.hazardTick=0;
  player.invuln=Math.max(0,player.invuln-dt); player.attackFlash=Math.max(0,player.attackFlash-dt); player.skillFlash=Math.max(0,player.skillFlash-dt); player.shiftEmpower=Math.max(0,player.shiftEmpower-dt); player.hurtFlash=Math.max(0,player.hurtFlash-dt);
}

function updateEnemies(dt) {
  for(const enemy of runtime.enemies){
    if(enemy.dead||!isEnemyVisible(enemy)) continue;
    enemy.hitFlash=Math.max(0,enemy.hitFlash-dt); enemy.attackCooldown=Math.max(0,enemy.attackCooldown-dt); enemy.aiTimer-=dt; enemy.stun=Math.max(0,enemy.stun-dt);
    if(enemy.stun>0) continue;
    const dx=player.x-enemy.x,dy=player.y-enemy.y,d=Math.hypot(dx,dy);
    if(d>260&&!enemy.boss) continue;
    const n=normalize(dx,dy);
    if(enemy.boss) updateBoss(enemy,dt,d,n);
    else if(enemy.behavior==='orbit'){
      const tangent={x:-n.y,y:n.x}; const toward=d>100?1:d<65?-1:0;
      moveEnemy(enemy,(n.x*toward+tangent.x*.7)*enemy.speed*dt,(n.y*toward+tangent.y*.7)*enemy.speed*dt);
      if(enemy.attackCooldown<=0&&d<155){spawnEnemyProjectile(enemy,Math.atan2(dy,dx),118);enemy.attackCooldown=1.7;}
    } else if(enemy.behavior==='dash'){
      if(enemy.aiTimer<=0&&d<180){enemy.vx=n.x*190;enemy.vy=n.y*190;enemy.aiTimer=1.8;enemy.attackCooldown=.35;}
      if(enemy.attackCooldown>.05&&enemy.attackCooldown<.32) moveEnemy(enemy,enemy.vx*dt,enemy.vy*dt);
      else moveEnemy(enemy,n.x*enemy.speed*dt,n.y*enemy.speed*dt);
    } else if(enemy.behavior==='slam'){
      moveEnemy(enemy,n.x*enemy.speed*dt,n.y*enemy.speed*dt);
      if(d<55&&enemy.attackCooldown<=0){
        enemy.attackCooldown=1.6; setTimeout(()=>{if(!enemy.dead&&runtime.mode==='playing'&&distance(enemy,player)<66) hurtPlayer(enemy.damage,enemy);},420);
        spawnRing(enemy.x,enemy.y,'#b8aa8d',.5,62);
      }
    } else if(enemy.behavior==='shoot'){
      const toward=d>120?1:d<85?-1:0; moveEnemy(enemy,n.x*toward*enemy.speed*dt,n.y*toward*enemy.speed*dt);
      if(enemy.attackCooldown<=0){spawnEnemyProjectile(enemy,Math.atan2(dy,dx),105,enemy.damage,'orb');enemy.attackCooldown=1.45;}
    } else {
      moveEnemy(enemy,n.x*enemy.speed*dt,n.y*enemy.speed*dt);
    }
    if(distance(player,enemy)<player.radius+enemy.radius+3&&enemy.attackCooldown<=0){ hurtPlayer(enemy.damage,enemy); enemy.attackCooldown=.9; }
  }
}

function moveEnemy(enemy,dx,dy){
  if(!isBlocked(runtime.zone.id,runtime.save.layer,enemy.x+dx,enemy.y,enemy.radius)) enemy.x+=dx;
  if(!isBlocked(runtime.zone.id,runtime.save.layer,enemy.x,enemy.y+dy,enemy.radius)) enemy.y+=dy;
}

function updateBoss(enemy,dt,d,n) {
  const ratio=enemy.hp/enemy.maxHp;
  enemy.phase=ratio<.35?3:ratio<.68?2:1;
  const cooldown=Math.max(.65,1.7-enemy.phase*.25);
  if(enemy.behavior==='boss-garden'){
    moveEnemy(enemy,n.x*enemy.speed*dt,n.y*enemy.speed*dt);
    if(enemy.aiTimer<=0){
      enemy.aiTimer=cooldown;
      const count=3+enemy.phase*2;
      for(let i=0;i<count;i++) spawnEnemyProjectile(enemy,i/count*Math.PI*2,85+enemy.phase*12,enemy.damage,'thorn');
      spawnRing(enemy.x,enemy.y,'#9fa568',.55,80);
    }
  } else if(enemy.behavior==='boss-water'){
    const tangent={x:-n.y,y:n.x}; moveEnemy(enemy,(n.x*.25+tangent.x*.8)*enemy.speed*dt,(n.y*.25+tangent.y*.8)*enemy.speed*dt);
    if(enemy.aiTimer<=0){
      enemy.aiTimer=cooldown;
      for(let i=-1-enemy.phase;i<=1+enemy.phase;i++) spawnEnemyProjectile(enemy,Math.atan2(player.y-enemy.y,player.x-enemy.x)+i*.17,120+enemy.phase*10,enemy.damage,'wave');
    }
  } else if(enemy.behavior==='boss-archive'){
    const toward=d>130?1:d<90?-1:0; moveEnemy(enemy,n.x*toward*enemy.speed*dt,n.y*toward*enemy.speed*dt);
    if(enemy.aiTimer<=0){
      enemy.aiTimer=cooldown;
      const base=Math.atan2(player.y-enemy.y,player.x-enemy.x);
      for(let i=0;i<6+enemy.phase*2;i++) spawnEnemyProjectile(enemy,base+i/(6+enemy.phase*2)*Math.PI*2,100+enemy.phase*12,enemy.damage,'letter');
      if(enemy.phase>=2&&runtime.save.layer===LAYERS.BLOOM) setTimeout(()=>{ if(runtime.mode==='playing') shiftBossLayerPressure(); },250);
    }
  } else if(enemy.behavior==='boss-final'){
    const tangent={x:-n.y,y:n.x}; moveEnemy(enemy,(n.x*.45+tangent.x*.5)*enemy.speed*dt,(n.y*.45+tangent.y*.5)*enemy.speed*dt);
    if(enemy.aiTimer<=0){
      enemy.aiTimer=Math.max(.55,cooldown-.2);
      const base=Math.atan2(player.y-enemy.y,player.x-enemy.x);
      if(enemy.phase===1){for(let i=-2;i<=2;i++)spawnEnemyProjectile(enemy,base+i*.22,145,enemy.damage,'needle');}
      if(enemy.phase===2){for(let i=0;i<10;i++)spawnEnemyProjectile(enemy,i/10*Math.PI*2,125,enemy.damage,'seam');}
      if(enemy.phase===3){
        for(let i=0;i<14;i++)spawnEnemyProjectile(enemy,i/14*Math.PI*2+(runtime.renderTime*.001),145,enemy.damage,'seam');
        setTimeout(()=>{if(runtime.mode==='playing') forcedShiftWarning();},300);
      }
    }
  }
}

function shiftBossLayerPressure(){
  showToast('Архивариус выворачивает зал');
  seamTransition.classList.remove('is-active');void seamTransition.offsetWidth;seamTransition.classList.add('is-active');
  const next=runtime.save.layer===LAYERS.BLOOM?LAYERS.ASH:LAYERS.BLOOM;
  const safe=findNearestValid(runtime.zone.id,next,player.x,player.y,player.radius);
  if(safe){runtime.save.layer=next;player.x=safe.x;player.y=safe.y;updateHud();}
}
function forcedShiftWarning(){
  spawnRing(player.x,player.y,'#e8dfbf',.55,70);
  setTimeout(()=>{if(runtime.mode==='playing'){const next=runtime.save.layer===LAYERS.BLOOM?LAYERS.ASH:LAYERS.BLOOM;const safe=findNearestValid(runtime.zone.id,next,player.x,player.y,player.radius);if(safe){runtime.save.layer=next;player.x=safe.x;player.y=safe.y;sound.shift();updateHud();}}},500);
}

function hurtPlayer(amount,source) {
  if(player.invuln>0||player.dead||runtime.mode!=='playing') return;
  const damage=Math.max(1,Math.round(amount*runtime.save.stats.damageTaken));
  runtime.save.stats.hp-=damage; player.invuln=.65; player.hurtFlash=.22; camera.shake=8;
  if(source){const n=normalize(player.x-source.x,player.y-source.y);tryMove(player,n.x*16,n.y*16);}
  spawnFloater(player.x,player.y-16,`-${damage}`,'#e87664',1.1); spawnBurst(player.x,player.y,'#b85b4b',12); sound.hurt(); vibrate([20,25,20]);
  if(runtime.save.stats.hp<=0) die();
  updateHud();
}

function die() {
  player.dead=true; runtime.save.stats.hp=1; runtime.save.inventory.threads=Math.floor(runtime.save.inventory.threads*.8); persistSave();
  setTimeout(()=>{
    openModal(`<p class="eyebrow">НИТЬ ОБОРВАЛАСЬ</p><h2>ТЫ УМЕР</h2><p>Святилище удержало твою форму, но двадцать процентов нитей остались там, где тебя разорвали.</p><div class="panel-actions"><button class="cloth-button primary" id="respawnButton" data-native-press>Вернуться к Святилищу</button><button class="cloth-button launcher-button" id="deathLauncher" data-native-press>Вернуться в Pocket Works</button></div>`);
    $('respawnButton').onclick=respawn; $('deathLauncher').onclick=returnToLauncher;
  },500);
}

function respawn() {
  const cp=runtime.save.checkpoint;
  runtime.save.stats.hp=runtime.save.stats.maxHp; runtime.save.stats.resolve=runtime.save.stats.maxResolve;
  player.dead=false; closeModal(false); loadZone(cp.zone,cp.position); setMode('playing'); showToast('Святилище восстановило нить');
}

