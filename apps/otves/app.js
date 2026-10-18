import { installMobileRuntime, setDocumentScrollLocked } from '../../shared/mobile-runtime.js';
import { watchOrientation, getDeviceCapabilities } from '../../shared/capabilities/device.js';
import { createRafLoop, watchReducedMotion } from '../../shared/capabilities/motion.js';
import { createInstrumentAudio, createInstrumentHaptics } from './instrument-feedback.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { createMaze, dimensionsForLevel, seedForLevel } from './maze.js';
import { MarblePhysics } from './physics.js';
import { GOAL_CAPTURE_MS, startGoalCapture } from './marble-motion.js';
import { MazeRenderer } from './renderer.js';
import { SpatialMazeRenderer } from './renderer3d.js';
import { recordKey } from './edge-layout.js';

installMobileRuntime();
setDocumentScrollLocked(true);

const STORAGE_NAMESPACE = 'pocket-works:otves';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const randomSeed = () => {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] || 1;
};

const elements = {
  canvas: document.querySelector('#gameCanvas'),
  level: document.querySelector('#levelValue'),
  time: document.querySelector('#timeValue'),
  best: document.querySelector('#bestValue'),
  inputReadout: document.querySelector('#inputReadout'),
  inputLabel: document.querySelector('#inputLabel'),
  toast: document.querySelector('#toast'),
  startScreen: document.querySelector('#startScreen'),
  pauseScreen: document.querySelector('#pauseScreen'),
  completeScreen: document.querySelector('#completeScreen'),
  continueButton: document.querySelector('#continueButton'),
  newRunButton: document.querySelector('#newRunButton'),
  pauseButton: document.querySelector('#pauseButton'),
  resumeButton: document.querySelector('#resumeButton'),
  restartButton: document.querySelector('#restartButton'),
  calibrateButton: document.querySelector('#calibrateButton'),
  pauseCalibrateButton: document.querySelector('#pauseCalibrateButton'),
  menuButton: document.querySelector('#menuButton'),
  nextButton: document.querySelector('#nextButton'),
  retryButton: document.querySelector('#retryButton'),
  resultTitle: document.querySelector('#resultTitle'),
  resultTime: document.querySelector('#resultTime'),
  resultCollisions: document.querySelector('#resultCollisions'),
  resultBest: document.querySelector('#resultBest'),
  recordStamp: document.querySelector('#recordStamp'),
  soundButtons: [...document.querySelectorAll('.sound-toggle')],
  hapticButtons: [...document.querySelectorAll('.haptic-toggle')]
};

const store = createVersionedStore({
  namespace: STORAGE_NAMESPACE,
  version: 1,
  defaults: {
    sound: true,
    haptics: true,
    currentLevel: 1,
    unlockedLevel: 1,
    runSeed: randomSeed(),
    bestTimes: {}
  },
  validate(value) {
    return Boolean(value)
      && typeof value.sound === 'boolean'
      && (value.haptics === undefined || typeof value.haptics === 'boolean')
      && Number.isInteger(value.currentLevel)
      && value.currentLevel >= 1
      && Number.isInteger(value.unlockedLevel)
      && value.unlockedLevel >= 1
      && Number.isInteger(value.runSeed)
      && value.runSeed >= 0
      && value.bestTimes
      && typeof value.bestTimes === 'object'
      && !Array.isArray(value.bestTimes);
  }
});

const audio = createInstrumentAudio({ enabled: store.get('sound', true), volume: .30 });
const haptics = createInstrumentHaptics({ enabled: store.get('haptics', true) });
// Keep the original 2D canvas as the input surface and as a genuine fallback.
// A separate WebGL canvas avoids the browser's irreversible canvas-context choice.
let renderer;
let fallbackRenderer = null;
let spatialCanvas = null;
try {
  const probe = document.createElement('canvas');
  if (probe.getContext('webgl2')) {
    spatialCanvas = document.createElement('canvas');
    spatialCanvas.className = 'spatial-canvas';
    spatialCanvas.setAttribute('aria-hidden', 'true');
    elements.canvas.insertAdjacentElement('afterend', spatialCanvas);
    renderer = new SpatialMazeRenderer(spatialCanvas);
  }
} catch (error) {
  console.warn('ОТВЕС: 3D renderer unavailable, using Canvas 2D', error);
  spatialCanvas?.remove();
}
if (!renderer) renderer = new MazeRenderer(elements.canvas);

function activeRenderer() {
  if (spatialCanvas && !renderer.isReady) {
    if (!fallbackRenderer) fallbackRenderer = new MazeRenderer(elements.canvas);
    spatialCanvas.style.display = 'none';
    return fallbackRenderer;
  }
  if (spatialCanvas) spatialCanvas.style.display = 'block';
  return renderer;
}
const marble = new MarblePhysics();
const capabilities = getDeviceCapabilities();

let state = 'menu';
let level = Math.max(1, store.get('currentLevel', 1));
let runSeed = store.get('runSeed', randomSeed());
let maze = null;
let elapsed = 0;
let collisions = 0;
let completion = 0;
let completedAt = 0;
let goalCapture = null;
let landingCuePlayed = false;
let orientationStop = null;
let sensorEnabled = false;
let sensorReceived = false;
let latestOrientation = null;
let baseline = null;
let sensorWatchTimer = 0;
let toastTimer = 0;
let hudUpdatedAt = 0;
let pointer = null;
let reducedMotion = false;
const keyState = new Set();
const sensorTilt = { x: 0, y: 0 };
const pointerTilt = { x: 0, y: 0 };
const visualTilt = { x: 0, y: 0 };

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${remaining.toFixed(2).padStart(5, '0')}`;
}

function showToast(message, duration = 1800) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => elements.toast.classList.remove('is-visible'), duration);
}

function setScreen(screen) {
  // The playfield remains edge-to-edge; modal focus and visibility are atomic.
  const wasPlaying = elements.canvas.closest('.app-shell')?.classList.contains('is-playing');
  elements.canvas.closest('.app-shell')?.classList.toggle('is-playing',
    !screen && (state === 'playing' || state === 'finishing'));
  for (const item of [elements.startScreen, elements.pauseScreen, elements.completeScreen]) {
    const visible = item === screen;
    item.classList.toggle('is-visible', visible);
    item.setAttribute('aria-hidden', String(!visible));
    item.inert = !visible;
  }
  if (screen) {
    screen.querySelector('.primary-key')?.focus({preventScroll:true});
  } else if (state === 'playing') {
    // Focus never remains trapped inside a now-inert modal.
    elements.pauseButton.focus({preventScroll:true});
  }
  if (!screen && !wasPlaying && state === 'playing') {
    elements.time.classList.remove('dial-awake');
    void elements.time.offsetWidth;
    elements.time.classList.add('dial-awake');
  }
}

function updateSoundButtons() {
  for (const button of elements.soundButtons) {
    button.textContent = `ЗВУК: ${audio.enabled ? 'ВКЛ' : 'ВЫКЛ'}`;
    button.setAttribute('aria-pressed', String(audio.enabled));
  }
}

function updateHapticButtons() {
  for (const button of elements.hapticButtons) {
    button.textContent = `ВИБРАЦИЯ: ${haptics.enabled ? 'ВКЛ' : 'ВЫКЛ'}`;
    button.setAttribute('aria-pressed', String(haptics.enabled));
    button.hidden = !haptics.available;
  }
}

function updateContinueLabel() {
  const currentLevel = Math.max(1, store.get('currentLevel', 1));
  elements.continueButton.textContent = currentLevel > 1
    ? `ПРОДОЛЖИТЬ · ЛАБИРИНТ ${String(currentLevel).padStart(2, '0')}`
    : 'РАЗРЕШИТЬ НАКЛОН И ИГРАТЬ';
}

function updateInputReadout() {
  elements.inputReadout.classList.toggle('is-live', sensorEnabled && sensorReceived);
  elements.inputReadout.classList.toggle('is-fallback', !sensorEnabled);
  if (sensorEnabled && sensorReceived) elements.inputLabel.textContent = 'НАКЛОН ТЕЛЕФОНА';
  else if (sensorEnabled) elements.inputLabel.textContent = 'ОЖИДАНИЕ ДАТЧИКА';
  else elements.inputLabel.textContent = 'ТЯНИ ПОЛЕ ПАЛЬЦЕМ';
}

function currentAspect() {
  const rect = elements.canvas.getBoundingClientRect();
  return rect.width / Math.max(1, rect.height);
}

function buildLevel(nextLevel = level) {
  level = Math.max(1, nextLevel);
  const dimensions = dimensionsForLevel(level, currentAspect());
  maze = createMaze({
    ...dimensions,
    seed: seedForLevel(runSeed, level)
  });
  marble.reset(maze.start);
  elapsed = 0;
  collisions = 0;
  completion = 0;
  completedAt = 0;
  goalCapture = null;
  landingCuePlayed = false;
  elements.level.value = String(level).padStart(2, '0');
  elements.time.textContent = formatTime(0);
  const bestTime = Number(store.get('bestTimes', {})[recordKey(level,maze.cols,maze.rows)]);
  elements.best.value = bestTime > 0 ? formatTime(bestTime) : '—';
}

function demoLevel() {
  goalCapture = null;
  completion = 0;
  landingCuePlayed = false;
  const dimensions = dimensionsForLevel(2, currentAspect());
  maze = createMaze({ ...dimensions, seed: 0x0f7e5a });
  marble.reset({ x: 1.5, y: 1.5 });
  elements.level.value = '—';
  elements.time.textContent = '00:00.00';
  elements.best.value = '—';
}

function mapOrientation(beta, gamma) {
  const rawAngle = Number(screen.orientation?.angle ?? window.orientation ?? 0);
  const angle = ((rawAngle % 360) + 360) % 360;
  if (angle === 90) return { x: beta, y: -gamma };
  if (angle === 270) return { x: -beta, y: gamma };
  if (angle === 180) return { x: -gamma, y: -beta };
  return { x: gamma, y: beta };
}

function applyDeadZone(value, zone = 0.035) {
  if (Math.abs(value) <= zone) return 0;
  return Math.sign(value) * ((Math.abs(value) - zone) / (1 - zone));
}

function updateSensorTilt() {
  if (!latestOrientation || !baseline) return;
  const mapped = mapOrientation(latestOrientation.beta, latestOrientation.gamma);
  const dx = clamp((mapped.x - baseline.x) / 13.5, -1.15, 1.15);
  const dy = clamp((mapped.y - baseline.y) / 13.5, -1.15, 1.15);
  sensorTilt.x += (applyDeadZone(dx) - sensorTilt.x) * 0.28;
  sensorTilt.y += (applyDeadZone(dy) - sensorTilt.y) * 0.28;
}

function calibrate(showMessage = true) {
  if (!latestOrientation) {
    sensorTilt.x = 0;
    sensorTilt.y = 0;
    if (showMessage) showToast(sensorEnabled ? 'ДЕРЖИ ТЕЛЕФОН РОВНО — ДАТЧИК ЕЩЁ ПРОСЫПАЕТСЯ' : 'ПАЛЬЦЕВОЙ РЕЖИМ НЕ ТРЕБУЕТ КАЛИБРОВКИ');
    return;
  }
  const mapped = mapOrientation(latestOrientation.beta, latestOrientation.gamma);
  baseline = { x: mapped.x, y: mapped.y };
  sensorTilt.x = 0;
  sensorTilt.y = 0;
  if (showMessage) showToast('ЭТО ПОЛОЖЕНИЕ ПРИНЯТО ЗА НОЛЬ');
  audio.play('calibrate');
  haptics.pulse('click');
}

async function enableSensor() {
  if (orientationStop) return true;
  sensorReceived = false;
  updateInputReadout();
  try {
    orientationStop = await watchOrientation(({ beta, gamma }) => {
      if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return;
      latestOrientation = { beta, gamma };
      if (!sensorReceived) {
        sensorReceived = true;
        sensorEnabled = true;
        calibrate(false);
        updateInputReadout();
        showToast('ДАТЧИК АКТИВЕН · НАКЛОНЯЙ МЯГКО');
      }
      updateSensorTilt();
    });
  } catch (error) {
    console.warn('Orientation sensor failed', error);
    orientationStop = null;
  }

  sensorEnabled = Boolean(orientationStop);
  updateInputReadout();
  window.clearTimeout(sensorWatchTimer);
  if (sensorEnabled) {
    sensorWatchTimer = window.setTimeout(() => {
      if (!sensorReceived) {
        sensorEnabled = false;
        updateInputReadout();
        showToast('ДАТЧИК МОЛЧИТ · ТЯНИ ДОСКУ ПАЛЬЦЕМ', 2400);
      }
    }, 1400);
  }
  return sensorEnabled;
}

async function prepareInput() {
  if (capabilities.orientationSensor) {
    const sensorPromise = enableSensor();
    await audio.unlock();
    const enabled = await sensorPromise;
    if (!enabled) showToast('НАКЛОН НЕ ДОСТУПЕН · ВКЛЮЧЁН ПАЛЬЦЕВОЙ РЕЖИМ', 2200);
  } else {
    await audio.unlock();
    sensorEnabled = false;
    updateInputReadout();
    showToast('НА ЭТОМ УСТРОЙСТВЕ ТЯНИ ДОСКУ ПАЛЬЦЕМ', 2200);
  }
}

async function startLevel(nextLevel = level) {
  if (state === 'starting') return;
  state = 'starting';
  const actions = [elements.continueButton, elements.newRunButton,
    elements.restartButton, elements.nextButton, elements.retryButton];
  for (const button of actions) button.disabled = true;
  elements.startScreen.setAttribute('aria-busy', 'true');
  elements.pauseScreen.setAttribute('aria-busy', 'true');
  elements.completeScreen.setAttribute('aria-busy', 'true');
  try {
    await prepareInput();
  } catch (error) {
    // A denied orientation/audio permission must not prevent finger play.
    console.warn('ОТВЕС: input preparation unavailable', error);
    sensorEnabled = false;
    sensorReceived = false;
    updateInputReadout();
    showToast('НАКЛОН НЕ ДОСТУПЕН · УПРАВЛЯЙ ПАЛЬЦЕМ');
  } finally {
    for (const button of actions) button.disabled = false;
    for (const screen of [elements.startScreen,elements.pauseScreen,elements.completeScreen])
      screen.removeAttribute('aria-busy');
  }
  buildLevel(nextLevel);
  state = 'playing';
  store.patch({ currentLevel: level, runSeed });
  setScreen(null);
  elements.pauseButton.disabled = false;
  audio.setPaused(false);
  audio.play('resume');
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  audio.setPaused(true);
  setScreen(elements.pauseScreen);
  audio.play('pause');
  haptics.pulse('click');
}

function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing';
  setScreen(null);
  audio.unlock().then(() => audio.setPaused(false)).catch(() => {});
  audio.play('resume');
  haptics.pulse('click');
}

function returnToMenu() {
  state = 'menu';
  audio.setPaused(true);
  elements.pauseButton.disabled = true;
  setScreen(elements.startScreen);
  updateContinueLabel();
  demoLevel();
  audio.play('click');
}

function completeLevel() {
  if (state !== 'playing') return;
  // Capture the incoming velocity and orientation BEFORE freezing physics.
  goalCapture = startGoalCapture(marble,maze.goal);
  state = 'finishing';
  audio.setPaused(true);
  elements.pauseButton.disabled = true;
  completedAt = performance.now();
  completion = 0;
  landingCuePlayed = false;
  // A restrained tap as the ball crosses the brass rim.
  audio.play('rim');
  elements.time.textContent = formatTime(elapsed);
  marble.velocity.x = 0;
  marble.velocity.y = 0;

  const bestTimes = store.get('bestTimes', {});
  const key = recordKey(level,maze.cols,maze.rows);
  const oldBest = Number(bestTimes[key]) || Infinity;
  const isRecord = elapsed < oldBest;
  if (isRecord) bestTimes[key] = Number(elapsed.toFixed(3));
  const unlockedLevel = Math.max(store.get('unlockedLevel', 1), level + 1);
  store.patch({
    bestTimes,
    unlockedLevel,
    currentLevel: level + 1,
    runSeed
  });

  elements.resultTitle.textContent = `ЛАБИРИНТ ${String(level).padStart(2, '0')} ПРОЙДЕН`;
  elements.resultTime.textContent = formatTime(elapsed);
  elements.resultCollisions.textContent = String(collisions);
  elements.resultBest.textContent = formatTime(Math.min(oldBest, elapsed));
  elements.recordStamp.classList.toggle('is-visible', isRecord);
  setScreen(null);
}

function revealCompletedLevel() {
  if(state !== 'finishing') return;
  state = 'complete';
  completion = 1;
  setScreen(elements.completeScreen);
  audio.play('success');
  haptics.pulse('success');
}

function handleCollision(speed) {
  collisions += 1;
  audio.impact(speed);
  if (speed > 1.7) haptics.pulse('collision', speed/4.3);
}

function effectiveTilt(now) {
  let x = sensorEnabled && sensorReceived ? sensorTilt.x : pointerTilt.x;
  let y = sensorEnabled && sensorReceived ? sensorTilt.y : pointerTilt.y;
  const keyboardX = (keyState.has('ArrowRight') || keyState.has('KeyD') ? 1 : 0) - (keyState.has('ArrowLeft') || keyState.has('KeyA') ? 1 : 0);
  const keyboardY = (keyState.has('ArrowDown') || keyState.has('KeyS') ? 1 : 0) - (keyState.has('ArrowUp') || keyState.has('KeyW') ? 1 : 0);
  if (keyboardX || keyboardY) {
    x = keyboardX * 0.78;
    y = keyboardY * 0.78;
  }
  if (state === 'menu' && !pointer) {
    x = Math.sin(now * 0.00043) * 0.18;
    y = Math.cos(now * 0.00031) * 0.14;
  }
  return { x, y };
}

function updateHud(now) {
  if (now - hudUpdatedAt < 45) return;
  hudUpdatedAt = now;
  if (state === 'playing' || state === 'paused') elements.time.textContent = formatTime(elapsed);
}


const loop = createRafLoop((now, deltaMilliseconds) => {
  if (!maze) return;
  const target = effectiveTilt(now);
  const smoothing = reducedMotion ? 0.28 : 0.14;
  visualTilt.x += (target.x - visualTilt.x) * smoothing;
  visualTilt.y += (target.y - visualTilt.y) * smoothing;

  if (state === 'playing') {
    const delta = deltaMilliseconds / 1000;
    elapsed += delta;
    marble.update(delta, target, maze, handleCollision);
    const dx = marble.position.x - maze.goal.x;
    const dy = marble.position.y - maze.goal.y;
    if (Math.hypot(dx, dy) < 0.31) completeLevel();
    audio.rolling(marble.speed());
  } else if (state === 'menu' && !reducedMotion) {
    marble.velocity.x = Math.sin(now * 0.0012) * 0.22;
    marble.velocity.y = Math.cos(now * 0.001) * 0.18;
    marble.spin += deltaMilliseconds * 0.0008;
  } else if (state === 'finishing') {
    completion = clamp((now - completedAt) / (reducedMotion ? 560 : GOAL_CAPTURE_MS), 0, 1);
    if (!landingCuePlayed && completion >= .87) {
      landingCuePlayed = true;
      audio.play('landing');
      haptics.pulse('landing');
    }
    if (completion >= 1) revealCompletedLevel();
  }

  activeRenderer().draw({ maze, marble, visualTilt, elapsed: now, mode: state, completion, goalCapture });
  updateHud(now);
});

function pointerCoordinates(event) {
  const rect = elements.canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

elements.canvas.addEventListener('pointerdown', (event) => {
  if (sensorEnabled && sensorReceived) return;
  const point = pointerCoordinates(event);
  pointer = { id: event.pointerId, x: point.x, y: point.y };
  elements.canvas.setPointerCapture(event.pointerId);
  elements.inputReadout.classList.add('is-pressed');
  event.preventDefault();
});

elements.canvas.addEventListener('pointermove', (event) => {
  if (!pointer || pointer.id !== event.pointerId) return;
  const point = pointerCoordinates(event);
  pointerTilt.x = clamp((point.x - pointer.x) / 76, -1.05, 1.05);
  pointerTilt.y = clamp((point.y - pointer.y) / 76, -1.05, 1.05);
  event.preventDefault();
});

function endPointer(event) {
  if (!pointer || pointer.id !== event.pointerId) return;
  pointer = null;
  pointerTilt.x = 0;
  pointerTilt.y = 0;
  elements.inputReadout.classList.remove('is-pressed');
  try { elements.canvas.releasePointerCapture(event.pointerId); } catch {}
}

elements.canvas.addEventListener('pointerup', endPointer);
elements.canvas.addEventListener('pointercancel', endPointer);
elements.canvas.addEventListener('lostpointercapture', endPointer);

window.addEventListener('keydown', (event) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
    keyState.add(event.code);
    event.preventDefault();
  }
  if (event.code === 'Escape') {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
  }
});
window.addEventListener('keyup', (event) => keyState.delete(event.code));
window.addEventListener('blur', () => keyState.clear());

window.addEventListener('resize', () => {
  renderer.resize();
  fallbackRenderer?.resize();
});
window.addEventListener('orientationchange', () => {
  window.setTimeout(() => {
    renderer.resize();
    fallbackRenderer?.resize();
    if (sensorReceived) calibrate(false);
  }, 280);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') pauseGame();
});

watchReducedMotion((value) => {
  reducedMotion = value;
  renderer.setReducedMotion(value);
  fallbackRenderer?.setReducedMotion(value);
});

elements.continueButton.addEventListener('click', () => {
  level = Math.max(1, store.get('currentLevel', 1));
  runSeed = store.get('runSeed', runSeed);
  startLevel(level);
});

elements.newRunButton.addEventListener('click', () => {
  runSeed = randomSeed();
  level = 1;
  store.patch({ currentLevel: 1, runSeed });
  startLevel(1);
});

elements.pauseButton.addEventListener('click', pauseGame);
elements.resumeButton.addEventListener('click', resumeGame);
elements.restartButton.addEventListener('click', () => startLevel(level));
elements.menuButton.addEventListener('click', returnToMenu);
elements.nextButton.addEventListener('click', () => startLevel(level + 1));
elements.retryButton.addEventListener('click', () => startLevel(level));
elements.calibrateButton.addEventListener('click', () => calibrate(true));
elements.pauseCalibrateButton.addEventListener('click', () => calibrate(true));

for (const button of elements.soundButtons) {
  button.addEventListener('click', async () => {
    const enabled = !audio.enabled;
    audio.setEnabled(enabled);
    store.set('sound', enabled);
    if (enabled) {
      await audio.unlock();
      audio.setPaused(state !== 'playing');
      audio.play('click');
    }
    updateSoundButtons();
  });
}

for (const button of elements.hapticButtons) {
  button.addEventListener('click', () => {
    const enabled = !haptics.enabled;
    haptics.setEnabled(enabled);
    store.set('haptics', enabled);
    updateHapticButtons();
    if (enabled) haptics.pulse('click');
  });
}

document.addEventListener('click', (event) => {
  if (!event.isTrusted || !event.target.closest('[data-native-press]')) return;
  if (event.target.closest('.haptic-toggle')) return;
  haptics.pulse('click');
});

createWorkshopMode({
  appName: 'ОТВЕС',
  version: '1.6.0',
  cachePrefix: 'otves-',
  storageNamespace: 'pocket-works:otves',
  onReset: async () => location.reload()
});

elements.pauseButton.disabled = true;
updateSoundButtons();
updateHapticButtons();
setScreen(elements.startScreen);
updateContinueLabel();
updateInputReadout();
demoLevel();
loop.start();
