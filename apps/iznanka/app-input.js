function setupInput() {
  window.addEventListener('keydown',(event)=>{
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Escape'].includes(event.key)) event.preventDefault();
    keys.add(event.key.toLowerCase());
    if(event.repeat) return;
    if(event.key==='Escape'){ if(runtime.mode==='playing') pauseGame(); else if(runtime.mode==='modal') closeModal(true); }
    if(runtime.mode!=='playing') return;
    if(event.key.toLowerCase()==='j') attack();
    if(event.key.toLowerCase()==='k') skill();
    if(event.key.toLowerCase()==='q') shiftLayer();
    if(event.key.toLowerCase()==='e') interact();
    if(event.key.toLowerCase()==='r') usePotion();
    if(event.code==='Space') dash();
  });
  window.addEventListener('keyup',(event)=>keys.delete(event.key.toLowerCase()));

  joystick.addEventListener('pointerdown',(event)=>{
    if(runtime.mode!=='playing') return;
    joystick.setPointerCapture(event.pointerId);
    input.joystickPointer=event.pointerId;
    const r=joystick.getBoundingClientRect();
    input.joystickCenter={x:r.left+r.width/2,y:r.top+r.height/2};
    updateJoystick(event);
  });
  joystick.addEventListener('pointermove',(event)=>{ if(event.pointerId===input.joystickPointer) updateJoystick(event); });
  const endJoy=(event)=>{
    if(event.pointerId!==input.joystickPointer) return;
    input.joystickPointer=null; input.x=0; input.y=0; stick.style.transform='translate(0px,0px)';
  };
  joystick.addEventListener('pointerup',endJoy); joystick.addEventListener('pointercancel',endJoy); joystick.addEventListener('lostpointercapture',endJoy);

  const bindAction=(button,fn)=>{
    bindPressFx(button);
    button.addEventListener('pointerdown',(event)=>{ event.preventDefault(); sound.unlock(); fn(); });
  };
  bindAction(attackButton,attack); bindAction(skillButton,skill); bindAction(dashButton,dash); bindAction(shiftButton,shiftLayer); bindAction(interactButton,interact);
  bindAction(pauseButton,pauseGame); bindAction(potionButton,usePotion);
  contextButton.addEventListener('pointerdown',(event)=>{event.preventDefault();interact();});
  continueButton.onclick=()=>{ const save=loadStoredSave(); if(save) startGame(save); };
  newGameButton.onclick=newGame;
  titleSettingsButton.onclick=()=>openSettings('title');
  document.querySelectorAll('[data-return-launcher]').forEach(el=>el.onclick=returnToLauncher);
  document.querySelectorAll('[data-native-press]').forEach(bindPressFx);
}

function updateJoystick(event) {
  const dx=event.clientX-input.joystickCenter.x, dy=event.clientY-input.joystickCenter.y;
  const max=42, d=Math.hypot(dx,dy), scale=d>max?max/d:1;
  const x=dx*scale,y=dy*scale;
  stick.style.transform=`translate(${x}px,${y}px)`;
  input.x=x/max; input.y=y/max;
}

function movementVector() {
  let x=input.x,y=input.y;
  if(keys.has('a')||keys.has('arrowleft')) x-=1;
  if(keys.has('d')||keys.has('arrowright')) x+=1;
  if(keys.has('w')||keys.has('arrowup')) y-=1;
  if(keys.has('s')||keys.has('arrowdown')) y+=1;
  const d=Math.hypot(x,y);
  if(d>1){x/=d;y/=d;}
  return {x,y};
}

function tryMove(entity, dx, dy, radius=entity.radius) {
  const layer=runtime.save.layer;
  const nx=entity.x+dx;
  if(!isBlocked(runtime.zone.id,layer,nx,entity.y,radius)) entity.x=nx;
  else if(entity===player&&Math.abs(dx)>1) camera.shake=Math.max(camera.shake,1);
  const ny=entity.y+dy;
  if(!isBlocked(runtime.zone.id,layer,entity.x,ny,radius)) entity.y=ny;
  else if(entity===player&&Math.abs(dy)>1) camera.shake=Math.max(camera.shake,1);
}

function dash() {
  if(runtime.mode!=='playing'||runtime.dashCooldown>0||player.dead) return;
  let mv=movementVector();
  if(Math.hypot(mv.x,mv.y)<.1) mv={x:player.facingX,y:player.facingY};
  const n=normalize(mv.x,mv.y);
  player.vx=n.x*285; player.vy=n.y*285; player.dashing=.18; player.invuln=.28;
  runtime.dashCooldown=runtime.save.stats.dashCooldown;
  spawnBurst(player.x,player.y,runtime.save.layer===LAYERS.ASH?'#9d86c6':'#d8b45b',9);
  sound.tone(170,.09,'square',.025,90); vibrate(8);
}

function attack() {
  if(runtime.mode!=='playing'||runtime.attackCooldown>0||player.dead) return;
  runtime.combo = runtime.comboWindow>0 ? runtime.combo%3+1 : 1;
  runtime.comboWindow=.43;
  runtime.attackCooldown=runtime.combo===3?.32:.22;
  player.attackFlash=.13;
  const range=runtime.combo===3?44:37;
  const base=computeHitDamage(runtime.save,'attack',runtime.combo);
  let hits=0;
  for(const enemy of runtime.enemies){
    if(enemy.dead||!isEnemyVisible(enemy)) continue;
    const dx=enemy.x-player.x,dy=enemy.y-player.y,d=Math.hypot(dx,dy);
    if(d>range+enemy.radius) continue;
    const dot=(dx/d)*player.facingX+(dy/d)*player.facingY;
    if(dot<-.15) continue;
    applyHit(enemy,base,'attack'); hits++;
  }
  if(runtime.combo===3&&runtime.save.inventory.equipped.includes('thorn-heart')){
    for(let i=-1;i<=1;i++) spawnPlayerProjectile(Math.atan2(player.facingY,player.facingX)+i*.35,18,170,'thorn');
  }
  if(hits===0) sound.tone(185,.045,'square',.018,-30);
  else vibrate(runtime.combo===3?18:9);
}

function skill() {
  if(runtime.mode!=='playing'||runtime.skillCooldown>0||player.dead) return;
  const s=runtime.save.stats;
  const cost=runtime.save.world.talked['cheap-needle']?20:25;
  if(s.resolve<cost){ showToast('Не хватает решимости'); return; }
  s.resolve-=cost; runtime.skillCooldown=.55; player.skillFlash=.18;
  const angle=Math.atan2(player.facingY,player.facingX);
  spawnPlayerProjectile(angle,computeHitDamage(runtime.save,'skill',1),250*s.projectileRange,'needle');
  sound.tone(420,.11,'triangle',.03,220); updateHud();
}

function shiftLayer() {
  if(runtime.mode!=='playing'||runtime.shiftCooldown>0||player.dead) return;
  const next=runtime.save.layer===LAYERS.BLOOM?LAYERS.ASH:LAYERS.BLOOM;
  const safe=findNearestValid(runtime.zone.id,next,player.x,player.y,player.radius);
  if(!safe){ showToast('Здесь шов слишком тугой'); camera.shake=5; vibrate([16,30,16]); return; }
  runtime.save.layer=next; player.x=safe.x; player.y=safe.y;
  runtime.shiftCooldown=1.0;
  if(runtime.save.inventory.equipped.includes('split-knot')) player.shiftEmpower=3;
  seamTransition.classList.remove('is-active'); void seamTransition.offsetWidth; seamTransition.classList.add('is-active');
  spawnBurst(player.x,player.y,next===LAYERS.ASH?'#9d86c6':'#d8b45b',22);
  sound.shift(); vibrate(18); updateHud();
}

function findNearestValid(zoneId,layer,x,y,radius) {
  if(!isBlocked(zoneId,layer,x,y,radius)) return {x,y};
  for(let ring=1;ring<=8;ring++){
    for(let i=0;i<16;i++){
      const a=i/16*Math.PI*2,nx=x+Math.cos(a)*ring*TILE,ny=y+Math.sin(a)*ring*TILE;
      if(!isBlocked(zoneId,layer,nx,ny,radius)) return {x:nx,y:ny};
    }
  }
  return null;
}

