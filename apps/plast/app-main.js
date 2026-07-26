function bindUi() {
  $('#continueButton').addEventListener('click',()=>startGame(false));
  $('#newWorldButton').addEventListener('click',()=>{if(!hasWorld||confirm('Создать новый мир? Текущий будет заменён.'))startGame(true);});
  $('#menuSettingsButton').addEventListener('click',()=>openSettings('menu'));
  $('#pauseButton').addEventListener('click',pauseGame); $('#resumeButton').addEventListener('click',resumeGame);
  $('#pauseSettingsButton').addEventListener('click',()=>openSettings('paused')); $('#saveExitButton').addEventListener('click',showMenu);
  $('#inventoryButton').addEventListener('pointerdown',(e)=>{e.preventDefault();openInventory();}); $('#inventoryClose').addEventListener('click',closeInventory);
  $('#settingsClose').addEventListener('click',closeSettings);
  $('#sensitivityInput').addEventListener('input',(e)=>{settings.sensitivity=Number(e.target.value);$('#sensitivityOutput').textContent=`${settings.sensitivity}%`;});
  $('#distanceInput').addEventListener('input',(e)=>{settings.distance=Number(e.target.value);$('#distanceOutput').textContent=settings.distance;});
  $('#soundToggle').addEventListener('click',()=>{settings.sound=!settings.sound;syncSettingsUI();playTone('ui');});
  $('#hapticToggle').addEventListener('click',()=>{settings.haptic=!settings.haptic;syncSettingsUI();pulseHaptic(12);});
  $('#leftHandToggle').addEventListener('click',()=>{settings.leftHand=!settings.leftHand;syncSettingsUI();applySettings();});
  $('#eraseWorldButton').addEventListener('click',()=>{if(confirm('Удалить сохранённый мир без возможности восстановления?')){localStorage.removeItem(STORAGE_KEY);hasWorld=false;changedBlocks=0;generateWorld((Date.now()^0x9e3779b9)>>>0);updateMenuMeta();closeSettings();showToast('Мир удалён');}});
  joystick.addEventListener('pointerdown',(e)=>{e.preventDefault();controls.joystickPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);updateJoystick(e);const now=performance.now();if(controls.joyY<-.55&&now-controls.lastForwardTap<330&&!player.crouching&&player.hunger>=2){player.sprinting=true;showToast('Бег');}});
  joystick.addEventListener('pointermove',(e)=>{if(e.pointerId===controls.joystickPointer)updateJoystick(e);});
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>joystick.addEventListener(type,(e)=>{if(e.pointerId===controls.joystickPointer){if(controls.joyY<-.55)controls.lastForwardTap=performance.now();resetJoystick();}}));
  lookZone.addEventListener('pointerdown',(e)=>{if(mode!=='game')return;e.preventDefault();controls.lookPointer=e.pointerId;controls.lastLookX=e.clientX;controls.lastLookY=e.clientY;lookZone.setPointerCapture(e.pointerId);});
  lookZone.addEventListener('pointermove',(e)=>{if(e.pointerId!==controls.lookPointer||mode!=='game')return;const mult=settings.sensitivity*.000095;player.yaw+=(e.clientX-controls.lastLookX)*mult;player.pitch=clamp(player.pitch-(e.clientY-controls.lastLookY)*mult,-1.38,1.38);controls.lastLookX=e.clientX;controls.lastLookY=e.clientY;});
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>lookZone.addEventListener(type,(e)=>{if(e.pointerId===controls.lookPointer)controls.lookPointer=null;}));
  $('#crouchButton').addEventListener('pointerdown',(e)=>{e.preventDefault();if(mode!=='game')return;player.crouching=!player.crouching;player.sprinting=false;$('#crouchButton').classList.toggle('active',player.crouching);pulseHaptic(8);playTone('ui');});
  bindHold($('#jumpButton'),()=>player.jumpHeld=true,()=>player.jumpHeld=false);
  bindHold($('#mineButton'),()=>{if(mode!=='game')return;if(entityTarget){hitEntity(entityTarget.entity);mining=false;}else{mining=true;swingHand();}},()=>{mining=false;miningProgress=0;breakRing.classList.remove('active');});
  $('#placeButton').addEventListener('pointerdown',(e)=>{e.preventDefault();placeSelected();});
  addEventListener('keydown',(e)=>{controls.keys.add(e.code);if(/^Digit[1-9]$/.test(e.code))selectSlot(Number(e.code.slice(5))-1);if(e.code==='KeyE'&&mode==='game')openInventory();if(e.code==='KeyC'&&mode==='game'){$('#crouchButton').dispatchEvent(new PointerEvent('pointerdown'));}if(e.code==='Escape'){if(mode==='game')pauseGame();else if(mode==='paused')resumeGame();else if(mode==='inventory')closeInventory();}});
  addEventListener('keyup',(e)=>controls.keys.delete(e.code));
  canvas.addEventListener('contextmenu',(e)=>e.preventDefault());
  canvas.addEventListener('pointerdown',(e)=>{if(e.pointerType!=='mouse'||mode!=='game')return;if(e.button===0){if(entityTarget)hitEntity(entityTarget.entity);else{mining=true;swingHand();}}if(e.button===2)placeSelected();});
  addEventListener('pointerup',(e)=>{if(e.pointerType==='mouse')mining=false;});
  addEventListener('resize',resizeCanvas); addEventListener('orientationchange',resizeCanvas);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){saveWorld();if(mode==='game')pauseGame();}});
  addEventListener('pagehide',saveWorld);
}

function updateHud() {
  $('#coordsLabel').textContent=`${Math.floor(player.x)} · ${Math.floor(player.y)} · ${Math.floor(player.z)}`;
  const id=getBlock(Math.floor(player.x),Math.floor(player.y-.08),Math.floor(player.z));
  $('#biomeLabel').textContent=player.underwater?'ПОД ВОДОЙ':(id===4?'ПОБЕРЕЖЬЕ':player.y>18?'ВЫСОКОГОРЬЕ':'ЛУГА');
  const minutes=Math.floor(worldTime*1440)%1440,hour=Math.floor(minutes/60),minute=minutes%60;
  $('#timeLabel').textContent=`ДЕНЬ ${worldDay} · ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
}
function loop(now) {
  const rawDt=Math.min(.05,Math.max(.001,(now-lastTime)/1000)); lastTime=now;
  frameTimeAverage=lerp(frameTimeAverage,rawDt*1000,.04);
  if(frameTimeAverage>30&&renderScale>.58){renderScale=Math.max(.58,renderScale-.04);frameTimeAverage=22;}
  if(mode==='game') { updatePhysics(rawDt,now);updateEntities(rawDt);updateParticles(rawDt);updateTarget();mineTick(rawDt);updateHud(); }
  render(now);
  requestAnimationFrame(loop);
}

async function bootApp() {
  applySettings(); bindUi(); buildHotbar(); buildInventory();buildVitals();
  try {
    bootFill.style.width='18%'; bootText.textContent='проверяем 3D'; await new Promise(r=>setTimeout(r,30));
    if(!initRenderer()) {boot.hidden=true;unsupported.hidden=false;return;}
    bootFill.style.width='42%'; bootText.textContent='поднимаем рельеф'; await new Promise(r=>setTimeout(r,30));
    generateWorld((Date.now()^0x51f15e)>>>0);
    bootFill.style.width='72%'; bootText.textContent='ищем сохранённый мир'; await new Promise(r=>setTimeout(r,30));
    loadWorld();
    if(!hasWorld) Object.assign(player,{...generatedSpawn,vx:0,vy:0,vz:0});
    updateMenuMeta();
    bootFill.style.width='100%'; bootText.textContent='готово';
    setTimeout(()=>{boot.hidden=true;menu.hidden=false;mode='menu';},180);
    requestAnimationFrame(loop);
  } catch(error) {
    console.error(error); boot.hidden=true; unsupported.hidden=false; unsupported.querySelector('p').textContent=`3D-система не запустилась: ${error.message}`;
  }
}

bootApp();
