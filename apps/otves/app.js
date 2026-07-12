import { installMobileRuntime, setDocumentScrollLocked } from '../../shared/mobile-runtime.js';
import { watchOrientation, getDeviceCapabilities } from '../../shared/capabilities/device.js';
import { createRafLoop, watchReducedMotion } from '../../shared/capabilities/motion.js';
import { createAudioFeedback } from '../../shared/capabilities/audio.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { createMaze, dimensionsForLevel, seedForLevel } from './maze.js';
import { MarblePhysics } from './physics.js';
import { MazeRenderer } from './renderer.js';

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
  soundButtons: [...document.querySelectorAll('.sound-toggle')]
};

const store = createVersionedStore({
  namespace: STORAGE_NAMESPACE,
  version: 1,
  defaults: {
    sound: true,
    currentLevel: 1,
    unlockedLevel: 1,
    runSeed: randomSeed(),
    bestTimes: {}
  },
  validate(value) {
    return Boolean(value)
      && typeof value.sound === 'boolean'
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

const audio = createAudioFeedback({ enabled: store.get('sound', true), volume: 0.2 });
const renderer = new MazeRenderer(elements.canvas);
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
let orientationStop = null;
let sensorEnabled = false;
let sensorReceived = false;
let latestOrientation = null;
let baseline = null;
let sensorWatchTimer = 0;
let toastTimer = 0;
let rollingSoundAt = 0;
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
  for (const item of [elements.startScreen, elements.pauseScreen, elements.completeScreen]) {
    const visible = item === screen;
    item.classList.toggle('is-visible', visible);
    item.setAttribute('aria-hidden', String(!visible));
  }
}

function updateSoundButtons() {
  for (const button of elements.soundButtons) {
    button.textContent = `ЗВУК: ${audio.enabled ? 'ВКЛ' : 'ВЫКЛ'}`;
    button.setAttribute('aria-pressed', String(audio.enabled));
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
  maze = createMaze({ ...dimensions, seed: seedForLevel(runSeed, level) });
  marble.reset(maze.start);
  elapsed = 0;
  collisions = 0;
  completion = 0;
  completedAt = 0;
  elements.level.value = String(level).padStart(2, '0');
  elements.time.value = formatTime(0);
  const bestTime = Number(store.get('bestTimes', {})[level]);
  elements.best.value = bestTime > 0 ? formatTime(bestTime) : '—';
}

function demoLevel() {
  const dimensions = dimensionsForLevel(2, currentAspect());
  maze = createMaze({ ...dimensions, seed: 0x0f7e5a });
  marble.reset({ x: 1.5, y: 1.5 });
  elements.level.value = '—';
  elements.time.value = '00:00.00';
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
  audio.play('click');
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
  await audio.unlock();
  if (capabilities.orientationSensor) {
    const enabled = await enableSensor();
    if (!enabled) showToast('НАКЛОН НЕ ДОСТУПЕН · ВКЛЮЧЁН ПАЛЬЦЕВОЙ РЕЖИМ', 2200);
  } else {
    sensorEnabled = false;
    updateInputReadout();
    showToast('НА ЭТОМ УСТРОЙСТВЕ ТЯНИ ДОСКУ ПАЛЬЦЕМ', 2200);
  }
}

async function startLevel(nextLevel = level) {
  await prepareInput();
  buildLevel(nextLevel);
  state = 'playing';
  store.patch({ currentLevel: level, runSeed });
  setScreen(null);
  elements.pauseButton.disabled = false;
  audio.play('click');
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  setScreen(elements.pauseScreen);
  audio.play('click');
}

function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing';
  setScreen(null);
  audio.play('click');
}

function returnToMenu() {
  state = 'menu';
  setScreen(elements.startScreen);
  updateContinueLabel();
  demoLevel();
  audio.play('click');
}

function completeLevel() {
  if (state !== 'playing') return;
  state = 'complete';
  completedAt = performance.now();
  completion = 0;
  marble.velocity.x = 0;
  marble.velocity.y = 0;

  const bestTimes = store.get('bestTimes', {});
  const oldBest = Number(bestTimes[level]) || Infinity;
  const isRecord = elapsed < oldBest;
  if (isRecord) bestTimes[level] = Number(elapsed.toFixed(3));
  const unlockedLevel = Math.max(store.get('unlockedLevel', 1), level + 1);
  store.patch({ bestTimes, unlockedLevel, currentLevel: level + 1, runSeed });

  elements.resultTitle.textContent = `ЛАБИРИНТ ${String(level).padStart(2, '0')} ПРОЙДЕН`;
  elements.resultTime.textContent = formatTime(elapsed);
  elements.resultCollisions.textContent = String(collisions);
  elements.resultBest.textContent = formatTime(Math.min(oldBest, elapsed));
  elements.recordStamp.classList.toggle('is-visible', isRecord);
  setScreen(elements.completeScreen);

  audio.tone({ frequency: 520, endFrequency: 690, duration: 0.11, type: 'sine', gain: 0.22 });
  audio.tone({ frequency: 710, endFrequency: 920, duration: 0.16, type: 'sine', gain: 0.2, delay: 0.08 });
  navigator.vibrate?.([18, 35, 22]);
}

function handleCollision(speed) {
  collisions += 1;
  if (audio.enabled) {
    audio.tone({
      frequency: clamp(540 + speed * 120, 590, 1050),
      endFrequency: clamp(430 + speed * 65, 470, 810),
      duration: 0.038 + clamp(speed, 0, 5) * 0.008,
      type: 'triangle',
      gain: clamp(0.055 + speed * 0.022, 0.06, 0.17)
    });
  }
  if (speed > 2.1) navigator.vibrate?.(7);
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
  if (state === 'playing' || state === 'paused') elements.time.value = formatTime(elapsed);
}

function rollingAudio(now) {
  if (!audio.enabled || state !== 'playing') return;
  const speed = marble.speed();
  if (speed < 0.72 || now < rollingSoundAt) return;
  const interval = clamp(185 - speed * 23, 64, 170);
  rollingSoundAt = now + interval;
  audio.tone({
    frequency: 210 + speed * 34 + Math.sin(now * 0.021) * 18,
    endFrequency: 190 + speed * 28,
    duration: 0.022,
    type: 'triangle',
    gain: clamp(0.018 + speed * 0.006, 0.018, 0.05)
  });
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
    rollingAudio(now);
  } else if (state === 'menu' && !reducedMotion) {
    marble.velocity.x = Math.sin(now * 0.0012) * 0.22;
    marble.velocity.y = Math.cos(now * 0.001) * 0.18;
    marble.spin += deltaMilliseconds * 0.0008;
  } else if (state === 'complete') {
    completion = clamp((now - completedAt) / 650, 0, 1);
  }

  renderer.draw({ maze, marble, visualTilt, elapsed: now, mode: state, completion });
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
window.addEventListener('resize', () => renderer.resize());
window.addEventListener('orientationchange', () => {
  window.setTimeout(() => {
    renderer.resize();
    if (sensorReceived) calibrate(false);
  }, 280);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') pauseGame();
});

watchReducedMotion((value) => {
  reducedMotion = value;
  renderer.setReducedMotion(value);
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
      audio.play('click');
    }
    updateSoundButtons();
  });
}

createWorkshopMode({
  appName: 'ОТВЕС',
  version: '1.0.0',
  cachePrefix: 'otves-',
  storageNamespace: STORAGE_NAMESPACE,
  onReset: async () => location.reload()
});

updateSoundButtons();
updateContinueLabel();
updateInputReadout();
demoLevel();
loop.start();
