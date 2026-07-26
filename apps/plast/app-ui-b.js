function showMenu() {
  mode='menu'; menu.hidden=false; hud.hidden=true; pauseOverlay.hidden=true; inventoryOverlay.hidden=true; settingsOverlay.hidden=true;
  mining=false; controls.joyX=controls.joyY=0; resetJoystick(); updateMenuMeta(); saveWorld();
}
function startGame(forceNew=false) {
  const creating=forceNew||!hasWorld;
  if (creating) {
    generateWorld((Date.now() ^ Math.floor(Math.random()*0xffffffff))>>>0);
    Object.assign(player,{...generatedSpawn,vx:0,vy:0,vz:0,yaw:.25,pitch:-.08,health:20,hunger:20,air:10,crouching:false,sprinting:false});
    hasWorld=true; hotbar=[...HOTBAR_DEFAULT];supplies={apple:2,meat:0}; selectedSlot=0; changedBlocks=0; buildHotbar(); buildInventory(); saveWorld();
  }
  mode='game'; menu.hidden=true; hud.hidden=false; pauseOverlay.hidden=true; inventoryOverlay.hidden=true; settingsOverlay.hidden=true;
  lastTime=performance.now();updateVitalsHud();showToast(creating?'Дважды вперёд — бег · ⌄ — красться':itemSpec(hotbar[selectedSlot]).name);
}
function pauseGame() { if(mode!=='game')return; mode='paused'; pauseOverlay.hidden=false; mining=false; $('#pauseSeed').textContent=seed.toString(16).toUpperCase(); $('#changedCount').textContent=changedBlocks; saveWorld(); }
function resumeGame() { mode='game'; pauseOverlay.hidden=true; settingsOverlay.hidden=true; lastTime=performance.now(); }
function openInventory() { if(mode!=='game')return; mode='inventory'; inventoryOverlay.hidden=false; mining=false; buildInventory(); }
function closeInventory() { inventoryOverlay.hidden=true; mode='game'; lastTime=performance.now(); }
function openSettings(from) { settingsReturn=from; settingsOverlay.hidden=false; if(from==='menu')menu.hidden=true; if(from==='paused')pauseOverlay.hidden=true; mode='settings'; syncSettingsUI(); }
function closeSettings() {
  settingsOverlay.hidden=true;
  if(settingsReturn==='menu'){menu.hidden=false;mode='menu';} else {pauseOverlay.hidden=false;mode='paused';}
  localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings)); applySettings();
}
function syncSettingsUI() {
  $('#sensitivityInput').value=settings.sensitivity; $('#sensitivityOutput').textContent=`${settings.sensitivity}%`;
  $('#distanceInput').value=settings.distance; $('#distanceOutput').textContent=settings.distance;
  $('#soundToggle i').textContent=settings.sound?'ВКЛ':'ВЫКЛ'; $('#hapticToggle i').textContent=settings.haptic?'ВКЛ':'ВЫКЛ'; $('#leftHandToggle i').textContent=settings.leftHand?'ВКЛ':'ВЫКЛ';
}
function applySettings() { appEl.classList.toggle('left-handed',settings.leftHand); }

function resetJoystick() { joystickKnob.style.transform='translate(0,0)'; controls.joyX=controls.joyY=0; controls.joystickPointer=null; }
function updateJoystick(event) {
  const rect=joystick.getBoundingClientRect(), cx=rect.left+rect.width/2, cy=rect.top+rect.height/2;
  let dx=event.clientX-cx,dy=event.clientY-cy; const max=rect.width*.34, len=Math.hypot(dx,dy);
  if(len>max){dx=dx/len*max;dy=dy/len*max;}
  controls.joyX=dx/max;controls.joyY=dy/max;joystickKnob.style.transform=`translate(${dx}px,${dy}px)`;
}
function bindHold(button,onStart,onEnd) {
  button.addEventListener('pointerdown',(e)=>{e.preventDefault();button.setPointerCapture(e.pointerId);button.classList.add('pressed');onStart();});
  const end=()=>{button.classList.remove('pressed');onEnd();}; button.addEventListener('pointerup',end);button.addEventListener('pointercancel',end);button.addEventListener('lostpointercapture',end);
}
