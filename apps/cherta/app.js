'use strict';
function pointerPos(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height}}
canvas.addEventListener('pointerdown',e=>{if(!running||paused||gameOver||player.dashing||player.detonating||player.charges<=0)return;initAudio();const p=pointerPos(e);pointer={down:true,id:e.pointerId,sx:p.x,sy:p.y,x:p.x,y:p.y};player.focus=true;canvas.setPointerCapture?.(e.pointerId);tone(72,.09,'sine',.015,35)});
canvas.addEventListener('pointermove',e=>{if(!pointer.down||e.pointerId!==pointer.id)return;const p=pointerPos(e);pointer.x=p.x;pointer.y=p.y});
function releasePointer(e){if(!pointer.down||e.pointerId!==pointer.id)return;const p=pointerPos(e);pointer.x=p.x;pointer.y=p.y;const dx=pointer.x-pointer.sx,dy=pointer.y-pointer.sy;pointer.down=false;player.focus=false;if(!beginDash(dx,dy))tone(90,.04,'sine',.01,0)}
canvas.addEventListener('pointerup',releasePointer);canvas.addEventListener('pointercancel',e=>{pointer.down=false;player.focus=false});
function showPanel(panel){panel.classList.remove('hidden')}
el('play').onclick=startGame;el('rulesPlay').onclick=startGame;el('restart').onclick=startGame;el('rulesBtn').onclick=()=>showPanel(ui.rules);
el('pauseBtn').onclick=()=>pauseGame(!paused);el('resume').onclick=()=>pauseGame(false);el('quit').onclick=quitToMenu;el('gameoverQuit').onclick=quitToMenu;
el('shellBtn').onclick=(event)=>{if(window.PocketWorks?.closeApp){event.preventDefault();window.PocketWorks.closeApp();}else if(window.parent!==window){event.preventDefault();window.parent.postMessage({type:'pocketworks:close-app',appId:'cherta'},'*');}};
el('settingsBtn').onclick=()=>showPanel(ui.settings);document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>el(b.dataset.close).classList.add('hidden'));
ui.soundBtn.onclick=()=>{settings.sound=!settings.sound;saveSettings();if(settings.sound)tone(300,.08,'sine',.025,100)};
ui.soundSwitch.onclick=()=>{settings.sound=!settings.sound;saveSettings()};ui.vibeSwitch.onclick=()=>{settings.vibe=!settings.vibe;saveSettings();vibrate(20)};
let resetArmed=false;let resetTimer=0;
el('resetBest').onclick=()=>{if(!resetArmed){resetArmed=true;el('resetBest').querySelector('span').textContent='НАЖМИ ЕЩЁ РАЗ';clearTimeout(resetTimer);resetTimer=setTimeout(()=>{resetArmed=false;el('resetBest').querySelector('span').textContent='СБРОСИТЬ РЕКОРД'},2600);return;}resetArmed=false;clearTimeout(resetTimer);best=0;bestWave=1;localStorage.removeItem('pocket-works:cherta:best');localStorage.removeItem('pocket-works:cherta:bestWave');el('resetBest').querySelector('span').textContent='СБРОСИТЬ РЕКОРД';syncSettings();callout('ЧИСТЫЙ ЛИСТ')};
window.addEventListener('keydown',e=>{if(e.code==='Space'&&running&&!paused){e.preventDefault();pointer.down=true;pointer.id=-1;pointer.sx=W*.5;pointer.sy=H*.5;pointer.x=W*.5;pointer.y=H*.5-90;player.focus=true}else if(e.code==='Escape')pauseGame(!paused)});
window.addEventListener('keyup',e=>{if(e.code==='Space'&&pointer.id===-1){pointer.down=false;player.focus=false;beginDash(0,-90)}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(running&&!paused&&!gameOver)pauseGame(true);if(audio?.state==='running')audio.suspend();}});
window.addEventListener('pagehide',()=>saveSettings(),{capture:true});

syncSettings();updateUI();render();last=performance.now();raf=requestAnimationFrame(loop);
window.__CHERTA__={
  start:startGame,
  dash:(dx,dy)=>beginDash(dx,dy),
  detonate,
  snapshot:()=>({running,paused,gameOver,score,kills,wave,enemies:enemies.filter(e=>!e.dead).length,projectiles:projectiles.length,player:{x:player.x,y:player.y,hp:player.hp,charges:player.charges,lines:player.lines.length,dashing:player.dashing,detonating:player.detonating}})
};
