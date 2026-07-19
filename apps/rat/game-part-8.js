function battleLoop(now) {
  requestAnimationFrame(battleLoop);
  const dt = Math.min(.033, (now - lastFrame) / 1000 || 0);
  lastFrame = now;
  if (currentScreen !== 'battle' || !simulation) return;
  if (!battlePaused && !simulation.finished) {
    simulation.update(dt);
    updateBattleHud(dt);
  }
  drawBattle(simulation, battleCtx, battleCanvas, false);
  globalThis.drawCommandOverlay?.(simulation, battleCtx, battleCanvas);
  if (simulation.finished && currentScreen === 'battle') endBattle();
}

function ensureHomeDemo() {
  if (homeDemo && !homeDemo.finished) return;
  const a = [
    { id: 'swords', type: 'swords', slot: 'center', formation: 'wedge' },
    { id: 'spears', type: 'spears', slot: 'left', formation: 'line' },
    { id: 'archers', type: 'archers', slot: 'right', formation: 'loose' }
  ];
  const b = [
    { id: 'swords', type: 'swords', slot: 'left', formation: 'line' },
    { id: 'spears', type: 'spears', slot: 'center', formation: 'wedge' },
    { id: 'archers', type: 'archers', slot: 'right', formation: 'loose' }
  ];
  homeDemo = new Simulation(a, b, true);
  homeDemo.units.forEach((unit) => { unit.y = lerp(unit.y, 590, .42); });
}

function homeLoop(now) {
  requestAnimationFrame(homeLoop);
  const dt = Math.min(.033, (now - homeLastFrame) / 1000 || 0);
  homeLastFrame = now;
  if (currentScreen !== 'home') return;
  ensureHomeDemo();
  homeDemo.update(dt * .8);
  drawBattle(homeDemo, homeCtx, homeCanvas, true);
  if (homeDemo.finished || homeDemo.time > 55) homeDemo = null;
}

function syncSettingsUI() {
  $('#soundToggle').checked = !!persistent.settings.sound;
  $('#hapticsToggle').checked = !!persistent.settings.haptics;
  $('#speedSelect').value = String(persistent.settings.speed);
  $('#difficultySelect').value = persistent.settings.difficulty;
}

function pauseBattle() {
  if (!simulation || currentScreen !== 'battle') return;
  battlePaused = true;
  openDialog(dialogs.pause);
}

$('#newBattleButton').addEventListener('click', () => { audio.unlock(); showScreen('setup'); });
$('#quickBattleButton').addEventListener('click', () => { audio.unlock(); startBattle({ quick: true }); });
$('#rulesButton').addEventListener('click', () => openDialog(dialogs.rules));
$('#homeSettingsButton').addEventListener('click', () => { syncSettingsUI(); openDialog(dialogs.settings); });
$('#setupBackButton').addEventListener('click', () => showScreen('home'));
$('#randomizeButton').addEventListener('click', randomizePlayerSetup);
$('#startBattleButton').addEventListener('click', () => startBattle());
$('#pauseButton').addEventListener('click', pauseBattle);
$('#resumeButton').addEventListener('click', () => { closeDialog(dialogs.pause); battlePaused = false; lastFrame = performance.now(); });
$('#pauseSettingsButton').addEventListener('click', () => { closeDialog(dialogs.pause); syncSettingsUI(); openDialog(dialogs.settings); });
$('#restartButton').addEventListener('click', restartBattle);
$('#quitBattleButton').addEventListener('click', () => { closeDialog(dialogs.pause); simulation = null; showScreen('home'); });
$('#rematchButton').addEventListener('click', () => startBattle());
$('#resultSetupButton').addEventListener('click', () => showScreen('setup'));
$('#resultMenuButton').addEventListener('click', () => showScreen('home'));

battleCanvas.addEventListener('pointerdown', (event) => {
  if (globalThis.beginCommandGesture?.(event)) event.preventDefault();
});
battleCanvas.addEventListener('pointermove', (event) => {
  if (globalThis.moveCommandGesture?.(event)) event.preventDefault();
});
battleCanvas.addEventListener('pointerup', (event) => {
  if (globalThis.endCommandGesture?.(event, false)) event.preventDefault();
});
battleCanvas.addEventListener('pointercancel', (event) => {
  globalThis.endCommandGesture?.(event, true);
});
battleCanvas.addEventListener('contextmenu', (event) => event.preventDefault());

$('#soundToggle').addEventListener('change', (event) => {
  persistent.settings.sound = event.target.checked;
  saveState();
  if (event.target.checked) audio.click();
});
$('#hapticsToggle').addEventListener('change', (event) => { persistent.settings.haptics = event.target.checked; saveState(); vibrate(12); });
$('#speedSelect').addEventListener('change', (event) => { persistent.settings.speed = Number(event.target.value); saveState(); });
$('#difficultySelect').addEventListener('change', (event) => { persistent.settings.difficulty = event.target.value; saveState(); });

dialogs.pause.addEventListener('close', () => {
  if (currentScreen === 'battle' && simulation && !simulation.finished) {
    battlePaused = false;
    lastFrame = performance.now();
  }
});

dialogs.settings.addEventListener('close', () => {
  if (currentScreen === 'battle' && simulation && !simulation.finished) {
    battlePaused = false;
    lastFrame = performance.now();
  }
});

window.addEventListener('visibilitychange', () => {
  if (document.hidden && currentScreen === 'battle' && simulation && !simulation.finished) {
    battlePaused = true;
  }
  lastFrame = performance.now();
  homeLastFrame = performance.now();
});
window.addEventListener('resize', () => { lastFrame = performance.now(); homeLastFrame = performance.now(); });
window.addEventListener('pagehide', saveState);
window.addEventListener('appdatareset', () => location.reload());

document.addEventListener('pointerdown', () => audio.unlock(), { once: true });

const style = document.createElement('style');
style.textContent = `
  .setup-mini{position:absolute;inset:0;display:block}.setup-mini i{position:absolute;width:7px;height:10px;margin:-4px 0 0 -3px;border-radius:50% 50% 42% 42%;background:var(--unit-color);box-shadow:0 2px 0 rgba(24,34,28,.28)}.setup-mini b{position:absolute;left:0;right:0;top:7px;text-align:center;color:rgba(255,255,255,.8);font-size:8px;letter-spacing:.08em}.deployment-slot:has(.setup-mini)::before{display:none}`;
document.head.appendChild(style);

globalThis.installCommandUI?.();
syncSettingsUI();
renderSetup();
showScreen('home');
requestAnimationFrame(battleLoop);
requestAnimationFrame(homeLoop);
