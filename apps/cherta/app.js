'use strict';

Promise.all([
  import('../../shared/mobile-runtime.js'),
  import('../../shared/workshop-mode.js')
]).then(([{ installMobileRuntime, setDocumentScrollLocked }, { createWorkshopMode }]) => {
  installMobileRuntime();
  setDocumentScrollLocked(true);
  createWorkshopMode({
    appName: 'ЧЕРТА',
    version: '1.1.0',
    cachePrefix: 'cherta-',
    storageNamespace: 'pocket-works:cherta',
    onReset() {
      localStorage.removeItem('pocket-works:cherta:settings');
      localStorage.removeItem('pocket-works:cherta:best');
      localStorage.removeItem('pocket-works:cherta:bestWave');
      window.location.reload();
    }
  });
});

function pointerPos(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height}}
function canStartGesture(){return running&&!paused&&!gameOver&&!player.detonating&&player.charges>0&&!pointer.down}
function startPointer(e){
  if(!canStartGesture())return;
  if(e.cancelable)e.preventDefault();
  initAudio();
  const p=pointerPos(e);
  pointer={down:true,id:e.pointerId,sx:p.x,sy:p.y,x:p.x,y:p.y};
  player.focus=!player.dashing;
  try{canvas.setPointerCapture?.(e.pointerId)}catch{}
  tone(72,.09,'sine',.015,35);
}
function movePointer(e){
  if(!pointer.down||e.pointerId!==pointer.id)return;
  if(e.cancelable)e.preventDefault();
  const p=pointerPos(e);pointer.x=p.x;pointer.y=p.y;
}
function finishPointer(e,{useLast=false}={}){
  if(!pointer.down||e.pointerId!==pointer.id)return;
  if(e.cancelable)e.preventDefault();
  if(!useLast&&Number.isFinite(e.clientX)&&Number.isFinite(e.clientY)){const p=pointerPos(e);pointer.x=p.x;pointer.y=p.y}
  const dx=pointer.x-pointer.sx,dy=pointer.y-pointer.sy,len=Math.hypot(dx,dy),id=pointer.id;
  pointer.down=false;pointer.id=null;player.focus=false;
  try{if(canvas.hasPointerCapture?.(id))canvas.releasePointerCapture(id)}catch{}
  if(len<12){tone(90,.04,'sine',.01,0);return}
  if(player.dashing){queuedDash={dx,dy};return}
  if(!beginDash(dx,dy)&&running&&!paused&&!gameOver&&!player.detonating&&player.charges>0)queuedDash={dx,dy};
}
function cancelPointer(e){finishPointer(e,{useLast:true})}

canvas.addEventListener('pointerdown',startPointer,{passive:false});
window.addEventListener('pointermove',movePointer,{passive:false,capture:true});
window.addEventListener('pointerup',finishPointer,{passive:false,capture:true});
window.addEventListener('pointercancel',cancelPointer,{passive:false,capture:true});
canvas.addEventListener('lostpointercapture',cancelPointer);

function showPanel(panel){panel.classList.remove('hidden');syncMenuLayer()}
function closePanel(panel){panel.classList.add('hidden');syncMenuLayer()}
function exitToShelf(event){
  event.preventDefault();event.stopPropagation();
  const target=new URL('../../',window.location.href).href,fallback=()=>{window.location.assign(target)};
  try{
    if(window.PocketWorks?.closeApp){window.PocketWorks.closeApp();return}
    if(window.parent!==window){window.parent.postMessage({type:'pocketworks:close-app',appId:'cherta'},'*');window.setTimeout(fallback,160);return}
  }catch{}
  fallback();
}

el('play').onclick=startGame;el('rulesPlay').onclick=startGame;el('restart').onclick=startGame;el('rulesBtn').onclick=()=>showPanel(ui.rules);
ui.pauseBtn.onclick=()=>pauseGame(!paused);el('resume').onclick=()=>pauseGame(false);el('quit').onclick=quitToMenu;el('gameoverQuit').onclick=quitToMenu;
el('shellBtn').addEventListener('click',exitToShelf);
el('settingsBtn').onclick=()=>showPanel(ui.settings);document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closePanel(el(b.dataset.close)));
ui.soundBtn.onclick=()=>{settings.sound=!settings.sound;saveSettings();if(settings.sound)tone(300,.08,'sine',.025,100)};
ui.soundSwitch.onclick=()=>{settings.sound=!settings.sound;saveSettings()};ui.vibeSwitch.onclick=()=>{settings.vibe=!settings.vibe;saveSettings();vibrate(20)};
let resetArmed=false;let resetTimer=0;
el('resetBest').onclick=()=>{if(!resetArmed){resetArmed=true;el('resetBest').querySelector('span').textContent='НАЖМИ ЕЩЁ РАЗ';clearTimeout(resetTimer);resetTimer=setTimeout(()=>{resetArmed=false;el('resetBest').querySelector('span').textContent='СБРОСИТЬ РЕКОРД'},2600);return}resetArmed=false;clearTimeout(resetTimer);best=0;bestWave=1;localStorage.removeItem('pocket-works:cherta:best');localStorage.removeItem('pocket-works:cherta:bestWave');el('resetBest').querySelector('span').textContent='СБРОСИТЬ РЕКОРД';syncSettings();callout('ЧИСТЫЙ ЛИСТ')};
window.addEventListener('keydown',e=>{if(e.code==='Space'&&running&&!paused){e.preventDefault();pointer.down=true;pointer.id=-1;pointer.sx=W*.5;pointer.sy=H*.5;pointer.x=W*.5;pointer.y=H*.5-90;player.focus=true}else if(e.code==='Escape')pauseGame(!paused)});
window.addEventListener('keyup',e=>{if(e.code==='Space'&&pointer.id===-1){pointer.down=false;player.focus=false;beginDash(0,-90)}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(running&&!paused&&!gameOver)pauseGame(true);if(audio?.state==='running')audio.suspend()}});
window.addEventListener('pagehide',()=>saveSettings(),{capture:true});

syncSettings();updateUI();render();last=performance.now();raf=requestAnimationFrame(loop);
window.__CHERTA__={
  start:startGame,
  dash:(dx,dy)=>beginDash(dx,dy),
  detonate,
  snapshot:()=>({running,paused,gameOver,score,kills,wave,waveStyle,bossPending,bossPhase,bossesKilled,bestCut,totalGrazes,enemies:enemies.filter(e=>!e.dead).length,corpses:enemies.filter(e=>e.dead).length,spawnWarnings:spawnWarnings.length,projectiles:projectiles.length,shake,queuedDash:Boolean(queuedDash),player:{x:player.x,y:player.y,hp:player.hp,charges:player.charges,lines:player.lines.length,dashing:player.dashing,detonating:player.detonating}})
};
