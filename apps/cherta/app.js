'use strict';

Promise.all([
  import('../../shared/mobile-runtime.js'),
  import('../../shared/workshop-mode.js')
]).then(([{ installMobileRuntime, setDocumentScrollLocked }, { createWorkshopMode }]) => {
  installMobileRuntime();
  setDocumentScrollLocked(true);
  createWorkshopMode({
    appName: 'ЧЕРТА',
    version: '1.1.1',
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

const gestureSurface = el('app');
const touchInputAvailable = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
let inputSerial = 0;

function pointerPosFromClient(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (clientX - r.left) * W / r.width,
    y: (clientY - r.top) * H / r.height
  };
}

function isControlTarget(target) {
  return target instanceof Element && Boolean(target.closest('button,a,input,select,textarea,[contenteditable="true"]'));
}

function canCaptureGesture() {
  return running && !paused && !gameOver;
}

function normalizeDash(dx, dy) {
  const len = Math.hypot(dx, dy);
  if (len < 7) return null;
  if (len >= 12) return { dx, dy };
  const scale = 12.25 / len;
  return { dx: dx * scale, dy: dy * scale };
}

function dashQueue() {
  if (!Array.isArray(queuedDash)) queuedDash = [];
  return queuedDash;
}

function tryConsumeQueuedDash() {
  const queue = dashQueue();
  if (!running || paused || gameOver || player.dashing || player.detonating || player.charges <= 0 || queue.length === 0) return false;
  const next = queue.shift();
  if (beginDash(next.dx, next.dy)) return true;
  queue.unshift(next);
  return false;
}

function submitDash(dx, dy) {
  const dash = normalizeDash(dx, dy);
  if (!dash) {
    tone(90, .04, 'sine', .01, 0);
    return false;
  }

  const queue = dashQueue();
  if (!player.dashing && !player.detonating && player.charges > 0 && beginDash(dash.dx, dash.dy)) return true;

  queue.push({ ...dash, at: performance.now() });
  while (queue.length > 3) queue.shift();
  return true;
}

function beginGesture(source, id, clientX, clientY, target) {
  if (!(target instanceof Node) || !gestureSurface.contains(target)) return false;
  if (!canCaptureGesture() || isControlTarget(target)) return false;

  if (pointer.down) {
    const age = performance.now() - (pointer.startedAt || 0);
    if (age < 2000) return false;
    pointer.down = false;
    player.focus = false;
  }

  initAudio();
  const p = pointerPosFromClient(clientX, clientY);
  pointer = {
    down: true,
    id,
    source,
    serial: ++inputSerial,
    startedAt: performance.now(),
    sx: p.x,
    sy: p.y,
    x: p.x,
    y: p.y
  };
  player.focus = !player.dashing && !player.detonating && player.charges > 0;
  tone(72, .09, 'sine', .015, 35);
  return true;
}

function moveGesture(source, id, clientX, clientY) {
  if (!pointer.down || pointer.source !== source || pointer.id !== id) return false;
  const p = pointerPosFromClient(clientX, clientY);
  pointer.x = p.x;
  pointer.y = p.y;
  return true;
}

function finishGesture(source, id, clientX, clientY, useLast = false) {
  if (!pointer.down || pointer.source !== source || pointer.id !== id) return false;

  if (!useLast && Number.isFinite(clientX) && Number.isFinite(clientY)) {
    moveGesture(source, id, clientX, clientY);
  }

  const dx = pointer.x - pointer.sx;
  const dy = pointer.y - pointer.sy;
  pointer.down = false;
  pointer.id = null;
  pointer.source = null;
  player.focus = false;
  submitDash(dx, dy);
  return true;
}

function findTouch(list, id) {
  for (const touch of list) if (touch.identifier === id) return touch;
  return null;
}

function onTouchStart(event) {
  if (event.touches.length > 1 || event.changedTouches.length === 0) return;
  if (pointer.down) {
    if (pointer.source === 'touch' && findTouch(event.touches, pointer.id)) return;
    pointer.down = false;
    pointer.id = null;
    pointer.source = null;
    player.focus = false;
  }
  const touch = event.changedTouches[0];
  if (beginGesture('touch', touch.identifier, touch.clientX, touch.clientY, event.target) && event.cancelable) {
    event.preventDefault();
  }
}

function onTouchMove(event) {
  if (!pointer.down || pointer.source !== 'touch') return;
  const touch = findTouch(event.touches, pointer.id) || findTouch(event.changedTouches, pointer.id);
  if (!touch) return;
  if (moveGesture('touch', pointer.id, touch.clientX, touch.clientY) && event.cancelable) event.preventDefault();
}

function onTouchEnd(event) {
  if (!pointer.down || pointer.source !== 'touch') return;
  const touch = findTouch(event.changedTouches, pointer.id);
  if (!touch) return;
  if (finishGesture('touch', pointer.id, touch.clientX, touch.clientY) && event.cancelable) event.preventDefault();
}

function onTouchCancel(event) {
  if (!pointer.down || pointer.source !== 'touch') return;
  const touch = findTouch(event.changedTouches, pointer.id);
  const handled = touch
    ? finishGesture('touch', pointer.id, touch.clientX, touch.clientY)
    : finishGesture('touch', pointer.id, NaN, NaN, true);
  if (handled && event.cancelable) event.preventDefault();
}

function onPointerDown(event) {
  if (touchInputAvailable && event.pointerType === 'touch') return;
  if (!event.isPrimary || (event.button !== undefined && event.button !== 0)) return;
  if (!beginGesture('pointer', event.pointerId, event.clientX, event.clientY, event.target)) return;
  if (event.cancelable) event.preventDefault();
  try { gestureSurface.setPointerCapture?.(event.pointerId); } catch {}
}

function onPointerMove(event) {
  if (!moveGesture('pointer', event.pointerId, event.clientX, event.clientY)) return;
  if (event.cancelable) event.preventDefault();
}

function onPointerUp(event) {
  if (!finishGesture('pointer', event.pointerId, event.clientX, event.clientY)) return;
  if (event.cancelable) event.preventDefault();
  try {
    if (gestureSurface.hasPointerCapture?.(event.pointerId)) gestureSurface.releasePointerCapture(event.pointerId);
  } catch {}
}

function onPointerCancel(event) {
  if (!finishGesture('pointer', event.pointerId, event.clientX, event.clientY, true)) return;
  if (event.cancelable) event.preventDefault();
}

if (touchInputAvailable) {
  window.addEventListener('touchstart', onTouchStart, { passive: false, capture: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
  window.addEventListener('touchend', onTouchEnd, { passive: false, capture: true });
  window.addEventListener('touchcancel', onTouchCancel, { passive: false, capture: true });
}

window.addEventListener('pointerdown', onPointerDown, { passive: false, capture: true });
window.addEventListener('pointermove', onPointerMove, { passive: false, capture: true });
window.addEventListener('pointerup', onPointerUp, { passive: false, capture: true });
window.addEventListener('pointercancel', onPointerCancel, { passive: false, capture: true });
gestureSurface.addEventListener('lostpointercapture', event => {
  if (pointer.down && pointer.source === 'pointer' && pointer.id === event.pointerId) {
    finishGesture('pointer', event.pointerId, NaN, NaN, true);
  }
});

finishDash = function reliableFinishDash() {
  player.dashing = false;
  player.x = player.toX;
  player.y = player.toY;

  const ordinal = 3 - player.charges;
  const line = {
    x1: player.fromX,
    y1: player.fromY,
    x2: player.toX,
    y2: player.toY,
    age: 0,
    cut: false,
    ordinal,
    power: ordinal === 3 ? 1.28 : 1,
    erase: 0,
    graze: player.grazes > 0
  };

  player.lines.push(line);
  player.comboTimer = .95;
  slashParticles(line.x1, line.y1, line.x2, line.y2, ordinal === 3 ? '#a94738' : '#202421');

  if (ordinal === 3) {
    flash = Math.max(flash, .08);
    tone(235, .08, 'square', .02, 115);
  }

  if (player.charges <= 0) {
    setTimeout(() => {
      if (running && !gameOver && !paused) detonate();
    }, 80);
  } else if (!tryConsumeQueuedDash() && pointer.down) {
    player.focus = true;
  }

  updateUI();
};

detonate = function reliableDetonate() {
  if (player.detonating || !player.lines.length) return;
  player.detonating = true;
  player.comboTimer = 0;

  const lines = player.lines.map(line => ({ ...line, graze: line.graze || player.grazes > 0 }));
  const points = collectIntersections(lines);
  player.lines = [];

  lines.forEach((line, index) => cutQueue.push({ t: index * .095, line }));
  points.forEach((point, index) => cutQueue.push({ t: lines.length * .095 + index * .075 + .02, point }));
  cutQueue.push({ t: lines.length * .095 + points.length * .075 + .12, finish: true });
  tone(110, .16, 'sawtooth', .03, 250);
  updateUI();
};

const baseUpdate = update;
update = function reliableInputUpdate(dt) {
  const wasDetonating = player.detonating;
  baseUpdate(dt);

  if (!running || paused || gameOver) return;
  if ((wasDetonating && !player.detonating) || (!player.dashing && !player.detonating && player.charges > 0)) {
    tryConsumeQueuedDash();
  }
};

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
window.addEventListener('keydown',e=>{if(e.code==='Space'&&running&&!paused){e.preventDefault();submitDash(0,-90)}else if(e.code==='Escape')pauseGame(!paused)});
document.addEventListener('visibilitychange',()=>{if(document.hidden){pointer.down=false;player.focus=false;if(running&&!paused&&!gameOver)pauseGame(true);if(audio?.state==='running')audio.suspend()}});
window.addEventListener('pagehide',()=>saveSettings(),{capture:true});

syncSettings();updateUI();render();last=performance.now();raf=requestAnimationFrame(loop);
window.__CHERTA__={
  start:startGame,
  dash:(dx,dy)=>submitDash(dx,dy),
  detonate,
  snapshot:()=>({
    running,paused,gameOver,score,kills,wave,waveStyle,bossPending,bossPhase,bossesKilled,bestCut,totalGrazes,
    enemies:enemies.filter(e=>!e.dead).length,
    corpses:enemies.filter(e=>e.dead).length,
    spawnWarnings:spawnWarnings.length,
    projectiles:projectiles.length,
    shake,
    queuedDashes:dashQueue().length,
    input:{down:pointer.down,source:pointer.source||null},
    player:{x:player.x,y:player.y,hp:player.hp,charges:player.charges,lines:player.lines.length,dashing:player.dashing,detonating:player.detonating}
  })
};
