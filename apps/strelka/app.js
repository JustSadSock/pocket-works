import {
  bindPointerGesture,
  installMobileRuntime
} from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';

installMobileRuntime();

const ROUTES = [
  { code: 'А', color: '#d9782d', name: 'ЛЕВАЯ ПЛАТФОРМА' },
  { code: 'Б', color: '#668269', name: 'ЦЕНТРАЛЬНАЯ ПЛАТФОРМА' },
  { code: 'В', color: '#d2b84e', name: 'ПРАВАЯ ПЛАТФОРМА' }
];

const TRAIN_TYPES = {
  passenger: { label: 'ПАССАЖИРСКИЙ', speed: 1, points: 100, cars: 2, body: '#d9d3bf' },
  freight: { label: 'ГРУЗОВОЙ ×1.6', speed: 0.8, points: 160, cars: 3, body: '#7c6b51' },
  express: { label: 'ЭКСПРЕСС ×1.4', speed: 1.34, points: 140, cars: 1, body: '#a84b3b' }
};

const store = createVersionedStore({
  namespace: 'pocket-works:strelka',
  version: 1,
  defaults: {
    bestScore: 0,
    bestStreak: 0,
    runs: 0,
    sound: true,
    vibration: true
  },
  validate(value) {
    return value && typeof value === 'object'
      && Number.isFinite(value.bestScore)
      && Number.isFinite(value.bestStreak)
      && Number.isFinite(value.runs)
      && typeof value.sound === 'boolean'
      && typeof value.vibration === 'boolean';
  }
});

const ui = {
  app: document.querySelector('#app'),
  canvas: document.querySelector('#yard'),
  score: document.querySelector('#scoreValue'),
  streak: document.querySelector('#streakValue'),
  faultLamps: document.querySelector('#faultLamps'),
  destinationLamp: document.querySelector('#destinationLamp'),
  destinationCode: document.querySelector('#destinationCode'),
  trainType: document.querySelector('#trainType'),
  lockoutStatus: document.querySelector('#lockoutStatus'),
  lockoutLine: document.querySelector('.lockout-line'),
  pauseButton: document.querySelector('#pauseButton'),
  soundButton: document.querySelector('#soundButton'),
  soundSetting: document.querySelector('#soundSetting'),
  vibrationSetting: document.querySelector('#vibrationSetting'),
  leverRail: document.querySelector('#leverRail'),
  leverHandle: document.querySelector('#leverHandle'),
  leverCode: document.querySelector('#leverCode'),
  leverHint: document.querySelector('#leverHint'),
  routeLabels: [...document.querySelectorAll('[data-route-label]')],
  toast: document.querySelector('#toast'),
  bestScore: document.querySelector('#bestScoreValue'),
  bestStreak: document.querySelector('#bestStreakValue'),
  finalScore: document.querySelector('#finalScore'),
  finalStreak: document.querySelector('#finalStreak'),
  finalTrains: document.querySelector('#finalTrains'),
  gameOverTitle: document.querySelector('#gameOverTitle'),
  gameOverText: document.querySelector('#gameOverText'),
  screens: [...document.querySelectorAll('.screen')],
  menuScreen: document.querySelector('#menuScreen'),
  howScreen: document.querySelector('#howScreen'),
  settingsScreen: document.querySelector('#settingsScreen'),
  pauseScreen: document.querySelector('#pauseScreen'),
  gameOverScreen: document.querySelector('#gameOverScreen'),
  confirmScreen: document.querySelector('#confirmScreen'),
  leverConsole: document.querySelector('.lever-console'),
  destinationPanel: document.querySelector('.destination-panel')
};

const ctx = ui.canvas.getContext('2d', { alpha: true, desynchronized: true });
const state = {
  mode: 'menu',
  score: 0,
  streak: 0,
  runBestStreak: 0,
  faults: 0,
  trains: 0,
  route: 1,
  train: null,
  spawnDelay: 0,
  locked: false,
  particles: [],
  lastTime: performance.now(),
  screenReturn: 'menuScreen',
  sound: store.get('sound', true),
  vibration: store.get('vibration', true),
  drag: null,
  metrics: null,
  audioContext: null,
  toastTimer: 0,
  lastDestination: -1
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

function showScreen(screenId = null) {
  for (const screen of ui.screens) {
    screen.classList.toggle('hidden', screen.id !== screenId);
  }
}

function syncRecords() {
  ui.bestScore.textContent = String(store.get('bestScore', 0));
  ui.bestStreak.textContent = String(store.get('bestStreak', 0));
}

function syncSettings() {
  ui.soundButton.setAttribute('aria-pressed', String(state.sound));
  ui.soundButton.textContent = state.sound ? 'ЗВУК' : 'ТИШИНА';
  ui.soundSetting.setAttribute('aria-pressed', String(state.sound));
  ui.soundSetting.textContent = state.sound ? 'ВКЛ' : 'ВЫКЛ';
  ui.vibrationSetting.setAttribute('aria-pressed', String(state.vibration));
  ui.vibrationSetting.textContent = state.vibration ? 'ВКЛ' : 'ВЫКЛ';
}

function buildFaultLamps() {
  ui.faultLamps.replaceChildren();
  for (let index = 0; index < 3; index += 1) {
    const lamp = document.createElement('i');
    lamp.classList.toggle('off', index < state.faults);
    ui.faultLamps.append(lamp);
  }
}

function updateHud() {
  ui.score.textContent = String(state.score).padStart(5, '0');
  ui.streak.textContent = String(state.streak).padStart(2, '0');
  buildFaultLamps();
}

function updateDestination() {
  const train = state.train;
  ui.destinationLamp.className = '';
  if (!train) {
    ui.destinationCode.textContent = '—';
    ui.trainType.textContent = state.mode === 'playing' ? 'ПРИЁМ СОСТАВА' : 'ОЖИДАНИЕ';
    ui.lockoutStatus.textContent = 'РЫЧАГ СВОБОДЕН';
    ui.lockoutLine.classList.remove('locked');
    return;
  }
  ui.destinationLamp.classList.add(`route-${train.destination}`);
  ui.destinationCode.textContent = ROUTES[train.destination].code;
  ui.trainType.textContent = TRAIN_TYPES[train.type].label;
  ui.lockoutStatus.textContent = state.locked ? `МАРШРУТ ЗАФИКСИРОВАН: ${ROUTES[train.assignedRoute].code}` : 'РЫЧАГ СВОБОДЕН';
  ui.lockoutLine.classList.toggle('locked', state.locked);
}

function ensureAudio() {
  if (!state.sound) return null;
  if (!state.audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    state.audioContext = new AudioContextClass();
  }
  if (state.audioContext.state === 'suspended') state.audioContext.resume().catch(() => {});
  return state.audioContext;
}

function tone(frequency, duration = 0.06, options = {}) {
  const audio = ensureAudio();
  if (!audio) return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const now = audio.currentTime;
  oscillator.type = options.type || 'square';
  oscillator.frequency.setValueAtTime(frequency, now);
  if (options.to) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.to), now + duration);
  gain.gain.setValueAtTime(options.gain ?? 0.025, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.01);
}

function soundLever() {
  tone(180, 0.035, { gain: 0.035, type: 'square', to: 115 });
  window.setTimeout(() => tone(520, 0.025, { gain: 0.018, type: 'triangle' }), 22);
}

function soundLock() {
  tone(110, 0.055, { gain: 0.04, type: 'square', to: 74 });
  window.setTimeout(() => tone(760, 0.04, { gain: 0.02, type: 'sine' }), 30);
}

function soundWheel() {
  tone(92, 0.022, { gain: 0.012, type: 'square', to: 72 });
}

function soundGood() {
  tone(430, 0.07, { gain: 0.035, type: 'triangle', to: 620 });
  window.setTimeout(() => tone(760, 0.09, { gain: 0.025, type: 'sine', to: 920 }), 55);
}

function soundBad() {
  tone(118, 0.2, { gain: 0.045, type: 'sawtooth', to: 54 });
  window.setTimeout(() => tone(68, 0.16, { gain: 0.03, type: 'square', to: 45 }), 90);
}

function vibrate(pattern) {
  if (state.vibration && navigator.vibrate) navigator.vibrate(pattern);
}

function flashToast(message, kind = 'good') {
  window.clearTimeout(state.toastTimer);
  ui.toast.textContent = message;
  ui.toast.className = `signal-toast ${kind} show`;
  state.toastTimer = window.setTimeout(() => {
    ui.toast.className = 'signal-toast';
  }, 650);
}

function leverOffsetForRoute(route) {
  const width = ui.leverRail.clientWidth;
  return (route - 1) * (width / 3);
}

function syncLeverVisual({ immediate = false } = {}) {
  if (!state.drag) {
    if (immediate) ui.leverHandle.style.transition = 'none';
    ui.leverHandle.style.transform = `translateX(${leverOffsetForRoute(state.route)}px)`;
    if (immediate) requestAnimationFrame(() => ui.leverHandle.style.removeProperty('transition'));
  }
  ui.leverCode.textContent = ROUTES[state.route].code;
  ui.leverHandle.classList.toggle('locked', state.locked);
  for (const label of ui.routeLabels) {
    label.classList.toggle('selected', Number(label.dataset.routeLabel) === state.route);
    label.setAttribute('aria-pressed', String(Number(label.dataset.routeLabel) === state.route));
  }
}

function blockedLeverFeedback() {
  flashToast('БЛОКИРОВКА', 'bad');
  ui.app.classList.remove('shake');
  void ui.app.offsetWidth;
  ui.app.classList.add('shake');
  tone(72, 0.07, { gain: 0.025, type: 'square', to: 52 });
  vibrate(18);
}

function setRoute(nextRoute, options = {}) {
  const route = clamp(Math.round(nextRoute), 0, 2);
  if (state.mode === 'playing' && state.locked && !options.force) {
    blockedLeverFeedback();
    return false;
  }
  const changed = route !== state.route;
  state.route = route;
  if (changed && !options.silent) {
    soundLever();
    vibrate(7);
  }
  syncLeverVisual({ immediate: options.immediate });
  return true;
}

function chooseTrainType() {
  const roll = Math.random();
  const progress = state.trains;
  if (progress > 5 && roll < Math.min(0.26, 0.1 + progress * 0.004)) return 'express';
  if (roll > 0.72) return 'freight';
  return 'passenger';
}

function spawnTrain() {
  let destination = Math.floor(Math.random() * 3);
  if (state.lastDestination === destination) destination = (destination + 1 + Math.floor(Math.random() * 2)) % 3;
  state.lastDestination = destination;
  state.train = {
    destination,
    assignedRoute: null,
    type: chooseTrainType(),
    progress: -0.08,
    wheelStep: -1,
    resolved: false
  };
  state.locked = false;
  updateDestination();
  syncLeverVisual();
  tone(290, 0.045, { gain: 0.018, type: 'triangle', to: 240 });
}

function addParticles(route, good) {
  if (!state.metrics) return;
  const x = state.metrics.lanes[route];
  const y = state.metrics.endY - 20;
  const amount = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 5 : 18;
  for (let index = 0; index < amount; index += 1) {
    state.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 150,
      vy: -40 - Math.random() * 130,
      life: 0.35 + Math.random() * 0.45,
      maxLife: 0.8,
      color: good ? ROUTES[route].color : '#a44739'
    });
  }
}

function saveRun() {
  const bestScore = Math.max(store.get('bestScore', 0), state.score);
  const bestStreak = Math.max(store.get('bestStreak', 0), state.runBestStreak);
  store.patch({
    bestScore,
    bestStreak,
    runs: store.get('runs', 0) + 1
  });
  syncRecords();
  return { bestScore, bestStreak };
}

function resolveTrain() {
  const train = state.train;
  if (!train || train.resolved) return;
  train.resolved = true;
  const correct = train.assignedRoute === train.destination;

  if (correct) {
    state.streak += 1;
    state.runBestStreak = Math.max(state.runBestStreak, state.streak);
    state.trains += 1;
    const type = TRAIN_TYPES[train.type];
    const multiplier = 1 + Math.min(2.5, Math.floor(state.streak / 5) * 0.25);
    const points = Math.round(type.points * multiplier);
    state.score += points;
    flashToast(`+${points} · ПУТЬ ${ROUTES[train.destination].code}`, 'good');
    soundGood();
    vibrate([9, 28, 9]);
    addParticles(train.destination, true);
  } else {
    state.faults += 1;
    state.streak = 0;
    state.trains += 1;
    flashToast(`ОШИБКА: НУЖЕН ${ROUTES[train.destination].code}`, 'bad');
    soundBad();
    vibrate([22, 45, 30]);
    addParticles(train.assignedRoute ?? state.route, false);
    ui.app.classList.remove('shake');
    void ui.app.offsetWidth;
    ui.app.classList.add('shake');
  }

  updateHud();
  state.locked = false;
  state.train = null;
  updateDestination();
  syncLeverVisual();

  if (state.faults >= 3) {
    state.mode = 'ending';
    ui.pauseButton.hidden = true;
    window.setTimeout(finishGame, 430);
  } else {
    state.spawnDelay = Math.max(0.22, 0.62 - state.trains * 0.008);
  }
}

function startGame() {
  ensureAudio();
  state.mode = 'playing';
  state.score = 0;
  state.streak = 0;
  state.runBestStreak = 0;
  state.faults = 0;
  state.trains = 0;
  state.train = null;
  state.spawnDelay = 0.35;
  state.locked = false;
  state.particles.length = 0;
  state.lastTime = performance.now();
  setRoute(1, { force: true, silent: true, immediate: true });
  updateHud();
  updateDestination();
  ui.pauseButton.hidden = false;
  showScreen(null);
  tone(240, 0.08, { gain: 0.025, type: 'square', to: 360 });
}

function pauseGame(fromVisibility = false) {
  if (state.mode !== 'playing') return;
  state.mode = 'paused';
  state.screenReturn = 'pauseScreen';
  showScreen('pauseScreen');
  ui.pauseButton.hidden = true;
  if (!fromVisibility) tone(140, 0.06, { gain: 0.02, type: 'triangle', to: 92 });
}

function resumeGame() {
  if (state.mode !== 'paused') return;
  state.mode = 'playing';
  state.lastTime = performance.now();
  ui.pauseButton.hidden = false;
  showScreen(null);
  tone(220, 0.055, { gain: 0.02, type: 'triangle', to: 310 });
}

function finishGame() {
  if (state.mode === 'gameover') return;
  state.mode = 'gameover';
  const previousBest = store.get('bestScore', 0);
  saveRun();
  ui.pauseButton.hidden = true;
  ui.finalScore.textContent = String(state.score);
  ui.finalStreak.textContent = String(state.runBestStreak);
  ui.finalTrains.textContent = String(state.trains);
  const newRecord = state.score > previousBest;
  ui.gameOverTitle.textContent = newRecord ? 'Новый рекорд' : 'Пульт снят с питания';
  ui.gameOverText.textContent = newRecord
    ? 'Смена закрыта без премии, зато цифры теперь раздражают всех предыдущих диспетчеров.'
    : 'Три ошибки — и автоматика вежливо отобрала у тебя железную дорогу.';
  showScreen('gameOverScreen');
}

function quitToMenu() {
  if (state.mode === 'playing' || state.mode === 'paused') saveRun();
  state.mode = 'menu';
  state.train = null;
  state.locked = false;
  state.particles.length = 0;
  ui.pauseButton.hidden = true;
  updateDestination();
  syncRecords();
  showScreen('menuScreen');
}

function openSettings(returnTo = 'menuScreen') {
  state.screenReturn = returnTo;
  showScreen('settingsScreen');
}

function closeUtilityScreen() {
  showScreen(state.screenReturn);
}

function toggleSound() {
  state.sound = !state.sound;
  store.set('sound', state.sound);
  syncSettings();
  if (state.sound) {
    ensureAudio();
    tone(480, 0.05, { gain: 0.02, type: 'triangle', to: 680 });
  }
}

function toggleVibration() {
  state.vibration = !state.vibration;
  store.set('vibration', state.vibration);
  syncSettings();
  if (state.vibration) vibrate([8, 24, 8]);
}

function resizeCanvas() {
  const rect = ui.canvas.getBoundingClientRect();
  const dpr = Math.min(2.25, window.devicePixelRatio || 1);
  ui.canvas.width = Math.max(1, Math.round(rect.width * dpr));
  ui.canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const destinationBottom = ui.destinationPanel.getBoundingClientRect().bottom;
  const consoleTop = ui.leverConsole.getBoundingClientRect().top;
  const canvasTop = rect.top;
  const startY = Math.max(185, destinationBottom - canvasTop + 15);
  const endY = Math.max(startY + 160, consoleTop - canvasTop - 8);
  state.metrics = {
    width: rect.width,
    height: rect.height,
    startY,
    endY,
    switchY: lerp(startY, endY, 0.58),
    lockY: lerp(startY, endY, 0.42),
    centerX: rect.width * 0.5,
    lanes: [rect.width * 0.2, rect.width * 0.5, rect.width * 0.8]
  };
  syncLeverVisual({ immediate: true });
}

function pathPoint(route, progress) {
  const metrics = state.metrics;
  const t = progress;
  const y = lerp(metrics.startY, metrics.endY, t);
  if (y <= metrics.switchY) return { x: metrics.centerX, y, angle: Math.PI / 2 };
  const amount = clamp((y - metrics.switchY) / Math.max(1, metrics.endY - metrics.switchY), 0, 1);
  const x = lerp(metrics.centerX, metrics.lanes[route], amount);
  const dx = metrics.lanes[route] - metrics.centerX;
  const dy = metrics.endY - metrics.switchY;
  return { x, y, angle: Math.atan2(dy, dx) };
}

function drawTrack(route) {
  const metrics = state.metrics;
  const lane = metrics.lanes[route];
  const railOffset = 5.5;
  const branchAngle = Math.atan2(metrics.endY - metrics.switchY, lane - metrics.centerX);
  const normalX = -Math.sin(branchAngle) * railOffset;
  const normalY = Math.cos(branchAngle) * railOffset;

  ctx.strokeStyle = '#433f37';
  ctx.lineWidth = 3;
  ctx.lineCap = 'square';

  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(metrics.centerX + side * railOffset, metrics.startY);
    ctx.lineTo(metrics.centerX + side * railOffset, metrics.switchY);
    ctx.lineTo(lane + normalX * side, metrics.endY + normalY * side);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(49,48,41,.58)';
  ctx.lineWidth = 2;
  for (let step = 0; step <= 18; step += 1) {
    const t = step / 18;
    const point = pathPoint(route, t);
    const next = pathPoint(route, Math.min(1, t + 0.01));
    const angle = Math.atan2(next.y - point.y, next.x - point.x);
    const nx = -Math.sin(angle) * 11;
    const ny = Math.cos(angle) * 11;
    ctx.beginPath();
    ctx.moveTo(point.x - nx, point.y - ny);
    ctx.lineTo(point.x + nx, point.y + ny);
    ctx.stroke();
  }
}

function drawYardBackground() {
  const metrics = state.metrics;
  ctx.clearRect(0, 0, metrics.width, metrics.height);
  ctx.fillStyle = '#747568';
  ctx.fillRect(0, metrics.startY - 8, metrics.width, metrics.endY - metrics.startY + 16);

  ctx.fillStyle = 'rgba(40,44,38,.2)';
  for (let index = 0; index < 90; index += 1) {
    const x = (index * 67.13) % metrics.width;
    const y = metrics.startY + ((index * 39.77) % Math.max(1, metrics.endY - metrics.startY));
    const size = 1 + (index % 3);
    ctx.fillRect(x, y, size, size);
  }

  ctx.fillStyle = '#d2b84e';
  ctx.fillRect(0, metrics.lockY - 6, metrics.width, 12);
  ctx.fillStyle = '#27312b';
  for (let x = -20; x < metrics.width + 20; x += 24) {
    ctx.save();
    ctx.translate(x, metrics.lockY);
    ctx.rotate(-0.75);
    ctx.fillRect(-5, -12, 10, 24);
    ctx.restore();
  }

  for (let route = 0; route < 3; route += 1) drawTrack(route);

  for (let route = 0; route < 3; route += 1) {
    const x = metrics.lanes[route];
    ctx.fillStyle = '#27312b';
    ctx.fillRect(x - 19, metrics.endY - 18, 38, 24);
    ctx.fillStyle = ROUTES[route].color;
    ctx.fillRect(x - 13, metrics.endY - 13, 26, 13);
    ctx.fillStyle = '#efe7d0';
    ctx.font = '900 13px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ROUTES[route].code, x, metrics.endY - 7);
  }
}

function drawCar(route, progress, body, destination, isEngine, type) {
  if (progress < -0.15 || progress > 1.12) return;
  const point = pathPoint(route, progress);
  const length = isEngine ? 34 : 28;
  const width = isEngine ? 21 : 19;

  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(point.angle - Math.PI / 2);
  ctx.fillStyle = 'rgba(24,27,24,.3)';
  ctx.fillRect(-width / 2 + 3, -length / 2 + 4, width, length);
  ctx.fillStyle = body;
  ctx.strokeStyle = '#27312b';
  ctx.lineWidth = 2;
  ctx.fillRect(-width / 2, -length / 2, width, length);
  ctx.strokeRect(-width / 2, -length / 2, width, length);

  ctx.fillStyle = '#27312b';
  ctx.fillRect(-width / 2 - 3, -length / 2 + 4, 3, 7);
  ctx.fillRect(width / 2, -length / 2 + 4, 3, 7);
  ctx.fillRect(-width / 2 - 3, length / 2 - 11, 3, 7);
  ctx.fillRect(width / 2, length / 2 - 11, 3, 7);

  if (isEngine) {
    ctx.fillStyle = ROUTES[destination].color;
    ctx.fillRect(-width / 2 + 3, -length / 2 + 3, width - 6, 10);
    ctx.fillStyle = '#f4ecd7';
    ctx.font = '900 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ROUTES[destination].code, 0, -length / 2 + 8);
    if (type === 'express') {
      ctx.fillStyle = '#efe7d0';
      ctx.beginPath();
      ctx.moveTo(-width / 2, length / 2);
      ctx.lineTo(width / 2, length / 2);
      ctx.lineTo(0, length / 2 + 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = 'rgba(39,49,43,.65)';
    ctx.fillRect(-width / 2 + 4, -length / 2 + 5, width - 8, length - 10);
  }
  ctx.restore();
}

function drawTrain() {
  const train = state.train;
  if (!train || !state.metrics) return;
  const route = train.assignedRoute ?? state.route;
  const type = TRAIN_TYPES[train.type];
  drawCar(route, train.progress, type.body, train.destination, true, train.type);
  for (let car = 1; car <= type.cars; car += 1) {
    drawCar(route, train.progress - car * 0.075, type.body, train.destination, false, train.type);
  }
}

function updateParticles(delta) {
  for (const particle of state.particles) {
    particle.life -= delta;
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.vy += 230 * delta;
  }
  state.particles = state.particles.filter((particle) => particle.life > 0);
}

function drawParticles() {
  for (const particle of state.particles) {
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x - 2, particle.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
}

function updateGame(delta) {
  updateParticles(delta);
  if (state.mode !== 'playing') return;

  if (!state.train) {
    state.spawnDelay -= delta;
    if (state.spawnDelay <= 0) spawnTrain();
    return;
  }

  const train = state.train;
  const difficulty = 1 + Math.min(1.25, state.trains * 0.022);
  const baseProgressPerSecond = 0.19;
  train.progress += delta * baseProgressPerSecond * difficulty * TRAIN_TYPES[train.type].speed;

  const wheelStep = Math.floor(train.progress * 24);
  if (wheelStep !== train.wheelStep && wheelStep >= 0) {
    train.wheelStep = wheelStep;
    if (wheelStep % 2 === 0) soundWheel();
  }

  const lockProgress = 0.42;
  if (!state.locked && train.progress >= lockProgress) {
    state.locked = true;
    train.assignedRoute = state.route;
    updateDestination();
    syncLeverVisual();
    soundLock();
    vibrate(10);
  }

  if (train.progress >= 1.06) resolveTrain();
}

function draw() {
  if (!state.metrics) return;
  drawYardBackground();
  drawTrain();
  drawParticles();
}

function frame(now) {
  const delta = clamp((now - state.lastTime) / 1000, 0, 0.05);
  state.lastTime = now;
  updateGame(delta);
  draw();
  requestAnimationFrame(frame);
}

bindPointerGesture(ui.leverRail, {
  onStart(event) {
    ensureAudio();
    if (state.mode === 'playing' && state.locked) {
      blockedLeverFeedback();
      return;
    }
    const rect = ui.leverRail.getBoundingClientRect();
    state.drag = { rect };
    ui.leverHandle.classList.add('dragging');
    event.preventDefault();
    const localX = clamp(event.clientX - rect.left, rect.width / 6, rect.width * 5 / 6);
    const route = clamp(Math.round((localX / rect.width) * 3 - 0.5), 0, 2);
    setRoute(route);
  },
  onMove(event) {
    if (!state.drag) return;
    if (state.mode === 'playing' && state.locked) return;
    event.preventDefault();
    const { rect } = state.drag;
    const min = rect.width / 6;
    const max = rect.width * 5 / 6;
    const localX = clamp(event.clientX - rect.left, min, max);
    const offset = localX - rect.width / 2;
    ui.leverHandle.style.transform = `translateX(${offset}px)`;
    const route = clamp(Math.round((localX / rect.width) * 3 - 0.5), 0, 2);
    if (route !== state.route) {
      state.route = route;
      soundLever();
      vibrate(6);
      ui.leverCode.textContent = ROUTES[route].code;
      for (const label of ui.routeLabels) label.classList.toggle('selected', Number(label.dataset.routeLabel) === route);
    }
  },
  onEnd() {
    if (!state.drag) return;
    state.drag = null;
    ui.leverHandle.classList.remove('dragging');
    syncLeverVisual();
  },
  onCancel() {
    if (!state.drag) return;
    state.drag = null;
    ui.leverHandle.classList.remove('dragging');
    syncLeverVisual();
  }
});

for (const label of ui.routeLabels) {
  label.addEventListener('click', () => {
    ensureAudio();
    setRoute(Number(label.dataset.routeLabel));
  });
}

document.querySelector('#startButton').addEventListener('click', startGame);
document.querySelector('#howStartButton').addEventListener('click', startGame);
document.querySelector('#restartButton').addEventListener('click', startGame);
document.querySelector('#resumeButton').addEventListener('click', resumeGame);
document.querySelector('#pauseButton').addEventListener('click', () => pauseGame(false));
document.querySelector('#quitButton').addEventListener('click', quitToMenu);
document.querySelector('#gameOverMenuButton').addEventListener('click', quitToMenu);
document.querySelector('#howButton').addEventListener('click', () => {
  state.screenReturn = 'menuScreen';
  showScreen('howScreen');
});
document.querySelector('#settingsButton').addEventListener('click', () => openSettings('menuScreen'));
document.querySelector('#pauseSettingsButton').addEventListener('click', () => openSettings('pauseScreen'));
ui.soundButton.addEventListener('click', toggleSound);
ui.soundSetting.addEventListener('click', toggleSound);
ui.vibrationSetting.addEventListener('click', toggleVibration);

for (const closeButton of document.querySelectorAll('[data-close-screen]')) {
  closeButton.addEventListener('click', closeUtilityScreen);
}

document.querySelector('#resetRecordsButton').addEventListener('click', () => {
  state.screenReturn = 'settingsScreen';
  showScreen('confirmScreen');
});
document.querySelector('#cancelResetButton').addEventListener('click', () => showScreen('settingsScreen'));
document.querySelector('#confirmResetButton').addEventListener('click', () => {
  store.patch({ bestScore: 0, bestStreak: 0, runs: 0 });
  syncRecords();
  flashToast('РЕКОРДЫ СБРОШЕНЫ', 'good');
  showScreen('settingsScreen');
});

window.addEventListener('resize', resizeCanvas, { passive: true });
window.addEventListener('orientationchange', () => requestAnimationFrame(resizeCanvas), { passive: true });
window.addEventListener('appviewportchange', resizeCanvas);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.mode === 'playing') pauseGame(true);
  state.lastTime = performance.now();
});

createWorkshopMode({
  appName: 'СТРЕЛКА',
  version: '1.0.0',
  cachePrefix: 'strelka-',
  storageNamespace: 'pocket-works:strelka',
  onReset() {
    store.reset();
    state.sound = true;
    state.vibration = true;
    syncSettings();
    syncRecords();
    quitToMenu();
  }
});

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});

syncSettings();
syncRecords();
updateHud();
updateDestination();
setRoute(1, { force: true, silent: true, immediate: true });
resizeCanvas();
requestAnimationFrame(frame);
