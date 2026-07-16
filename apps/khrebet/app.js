import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  AIRCRAFT_CORE_RADIUS,
  RUN_SAVE_VERSION,
  awardScore,
  canyonClearance,
  clamp,
  comboMultiplier,
  courseAt,
  createFlightState,
  dailySeed,
  damp,
  freshProfile,
  gateHit,
  lerp,
  progressDifficulty,
  routeCode,
  sanitizeProfile,
  sanitizeSavedRun,
  stepFlight,
  sweptObstacleClearance,
} from './game-core.js';
import { RidgeEngine } from './engine.js';
import { RidgeWorld } from './world.js';
import { WindAudio } from './sound.js';

installMobileRuntime();

const STORAGE_KEY = 'pocket-works:khrebet:profile';
const FLOW_DURATION = 5.4;
const COMBO_DURATION = 4.4;
const byId = (id) => document.getElementById(id);
const elements = {
  stage: byId('flightStage'),
  canvas: byId('worldCanvas'),
  sun: document.querySelector('.sky-sun'),
  loading: byId('loadingState'),
  loadingCopy: byId('loadingCopy'),
  fallback: byId('webglFallback'),
  flightHeader: byId('flightHeader'),
  flightHud: byId('flightHud'),
  pauseButton: byId('pauseButton'),
  modeLabel: byId('modeLabel'),
  biomeLabel: byId('biomeLabel'),
  distanceValue: byId('distanceValue'),
  integrityBlock: document.querySelector('.integrity-block'),
  integrityFill: byId('integrityFill'),
  integrityValue: byId('integrityValue'),
  scoreValue: byId('scoreValue'),
  comboBlock: byId('comboBlock'),
  comboLabel: byId('comboLabel'),
  comboValue: byId('comboValue'),
  comboTimer: byId('comboTimer'),
  flowBlock: byId('flowBlock'),
  flowFill: byId('flowFill'),
  flowValue: byId('flowValue'),
  reticle: byId('flightReticle'),
  steerCursor: byId('steerCursor'),
  callout: byId('eventCallout'),
  speedTape: byId('speedTape'),
  speedValue: byId('speedValue'),
  diveButton: byId('diveButton'),
  diveLabel: byId('diveLabel'),
  impactFlash: byId('impactFlash'),
  flowFlash: byId('flowFlash'),
  boostVignette: byId('boostVignette'),
  proximityFrame: byId('proximityFrame'),
  proximityLeft: byId('proximityLeft'),
  proximityRight: byId('proximityRight'),
  proximityFloor: byId('proximityFloor'),
  menu: byId('menuOverlay'),
  bestDistance: byId('bestDistance'),
  bestScore: byId('bestScore'),
  flightCount: byId('flightCount'),
  dailyCode: byId('dailyCode'),
  startButton: byId('startButton'),
  dailyButton: byId('dailyButton'),
  resumeButton: byId('resumeButton'),
  resumeMeta: byId('resumeMeta'),
  howButton: byId('howButton'),
  settingsButton: byId('settingsButton'),
  briefing: byId('briefingOverlay'),
  briefingClose: byId('briefingClose'),
  briefingStart: byId('briefingStart'),
  pauseOverlay: byId('pauseOverlay'),
  pauseDistance: byId('pauseDistance'),
  pauseScore: byId('pauseScore'),
  pauseCombo: byId('pauseCombo'),
  continueButton: byId('continueButton'),
  pauseRestartButton: byId('pauseRestartButton'),
  pauseSettingsButton: byId('pauseSettingsButton'),
  pauseMenuButton: byId('pauseMenuButton'),
  resultOverlay: byId('resultOverlay'),
  resultKicker: byId('resultKicker'),
  resultTitle: byId('resultTitle'),
  resultScore: byId('resultScore'),
  newRecord: byId('newRecord'),
  resultDistance: byId('resultDistance'),
  resultGates: byId('resultGates'),
  resultNear: byId('resultNear'),
  resultCombo: byId('resultCombo'),
  resultNote: byId('resultNote'),
  againButton: byId('againButton'),
  resultMenuButton: byId('resultMenuButton'),
  settingsLayer: byId('settingsLayer'),
  settingsBackdrop: byId('settingsBackdrop'),
  settingsClose: byId('settingsClose'),
  soundSetting: byId('soundSetting'),
  hapticSetting: byId('hapticSetting'),
  sensitivitySetting: byId('sensitivitySetting'),
  effectsSetting: byId('effectsSetting'),
  settingsBestDistance: byId('settingsBestDistance'),
  settingsBestScore: byId('settingsBestScore'),
  resetButton: byId('resetButton'),
};

function readProfile() {
  try {
    return sanitizeProfile(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
  } catch {
    return freshProfile();
  }
}

let profile = readProfile();
function persistProfile() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); }
  catch (error) { console.warn('Не удалось сохранить данные ХРЕБТА', error); }
}

function localDateKey(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function randomSeed() {
  if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
  return (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
}

const todayKey = localDateKey();
const todaySeed = dailySeed(todayKey);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const audio = new WindAudio();
audio.setEnabled(profile.settings.sound);

let engine;
let world;
let phase = 'loading';
let run = null;
let pendingLaunch = null;
let frameHandle = 0;
let previousFrame = performance.now();
let demoTime = 0;
let demoFlight = createFlightState();
let cameraState = { x: 0, y: 16, z: -12, tx: 0, ty: 11, tz: 16, fov: Math.PI * 0.38, roll: 0 };
let shake = 0;
let resetArmedUntil = 0;
let runEndedAt = 0;

const input = {
  pointerId: null,
  startX: 0,
  startY: 0,
  x: 0,
  y: 0,
  boosted: false,
  keys: new Set(),
};

function haptic(pattern) {
  if (!profile.settings.haptics || !navigator.vibrate) return;
  navigator.vibrate(pattern);
}

function setHidden(element, hidden) {
  if (element) element.hidden = hidden;
}

function setFlightChrome(visible) {
  for (const element of [elements.flightHeader, elements.flightHud, elements.speedTape, elements.diveButton]) {
    setHidden(element, !visible);
  }
  elements.reticle.style.display = visible ? '' : 'none';
  elements.proximityFrame.style.display = visible ? '' : 'none';
}

function syncProfileUi() {
  elements.bestDistance.textContent = `${Math.floor(profile.bestDistance)} м`;
  elements.bestScore.textContent = Math.floor(profile.bestScore).toLocaleString('ru-RU');
  elements.flightCount.textContent = String(profile.flights);
  elements.dailyCode.textContent = routeCode(todaySeed);
  elements.settingsBestDistance.textContent = `${Math.floor(profile.bestDistance)} м`;
  elements.settingsBestScore.textContent = Math.floor(profile.bestScore).toLocaleString('ru-RU');
  const saved = sanitizeSavedRun(profile.savedRun);
  setHidden(elements.resumeButton, !saved);
  if (saved) {
    elements.resumeMeta.textContent = `${Math.floor(saved.flight.z)} м · ${saved.mode === 'daily' ? 'маршрут дня' : routeCode(saved.seed)}`;
  }
  syncSettingsUi();
}

function syncSettingsUi() {
  const settings = profile.settings;
  elements.soundSetting.querySelector('i').textContent = settings.sound ? 'ВКЛ' : 'ВЫКЛ';
  elements.soundSetting.dataset.off = String(!settings.sound);
  elements.hapticSetting.querySelector('i').textContent = settings.haptics ? 'ВКЛ' : 'ВЫКЛ';
  elements.hapticSetting.dataset.off = String(!settings.haptics);
  const sensitivityLabel = settings.sensitivity === 0.75 ? 'МЯГКАЯ' : settings.sensitivity === 1.25 ? 'ОСТРАЯ' : 'ОБЫЧНАЯ';
  elements.sensitivitySetting.querySelector('i').textContent = sensitivityLabel;
  elements.effectsSetting.querySelector('i').textContent = settings.effects ? 'ПОЛНО' : 'МАЛО';
  elements.effectsSetting.dataset.off = String(!settings.effects);
  if (engine) engine.dprLimit = settings.effects ? 1.7 : 1.2;
}

function showCallout(title, subtitle = '') {
  const titleElement = elements.callout.querySelector('b');
  const subtitleElement = elements.callout.querySelector('span');
  titleElement.textContent = title;
  subtitleElement.textContent = subtitle;
  elements.callout.classList.remove('is-active');
  void elements.callout.offsetWidth;
  elements.callout.classList.add('is-active');
}

function pulse(element, className = 'is-active') {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function openSettings() {
  syncProfileUi();
  setHidden(elements.settingsLayer, false);
  elements.settingsClose.focus({ preventScroll: true });
  audio.event('ui');
}

function closeSettings() {
  setHidden(elements.settingsLayer, true);
  audio.event('ui');
}

function clearInput() {
  input.pointerId = null;
  input.x = 0;
  input.y = 0;
  input.boosted = false;
  input.keys.clear();
  elements.steerCursor.classList.remove('is-visible');
  elements.diveButton.classList.remove('is-held');
  elements.stage.classList.remove('is-boosting');
}

function createRun(mode, seed, saved = null) {
  const restored = saved ? sanitizeSavedRun(saved) : null;
  const flight = restored ? { ...restored.flight } : createFlightState();
  const initialCourse = courseAt(flight.z, seed);
  if (!restored) {
    flight.x = initialCourse.center;
    flight.y = initialCourse.floor + 13.5;
  }
  return {
    seed: seed >>> 0,
    mode,
    flight,
    score: restored?.score || 0,
    integrity: restored?.integrity || 100,
    flow: restored?.flow || 0,
    flowTime: restored?.flowTime || 0,
    combo: restored?.combo || 1,
    maxCombo: restored?.maxCombo || 1,
    comboTime: restored?.comboTime || 0,
    gates: restored?.gates || 0,
    nearMisses: restored?.nearMisses || 0,
    passed: new Set(restored?.passed || []),
    grazed: new Set(restored?.grazed || []),
    lastDamageTime: -10,
    lastSaveTime: 0,
    altitudeWarningZone: -1,
    biomeZone: -1,
    wasBoosted: false,
  };
}

function serialiseRun() {
  if (!run) return null;
  return {
    version: RUN_SAVE_VERSION,
    seed: run.seed,
    mode: run.mode,
    flight: { ...run.flight },
    score: Math.floor(run.score),
    integrity: run.integrity,
    flow: run.flow,
    flowTime: run.flowTime,
    combo: run.combo,
    maxCombo: run.maxCombo,
    comboTime: run.comboTime,
    gates: run.gates,
    nearMisses: run.nearMisses,
    passed: [...run.passed].slice(-500),
    grazed: [...run.grazed].slice(-500),
    savedAt: Date.now(),
  };
}

function saveActiveRun() {
  if (!run || !['running', 'paused'].includes(phase)) return;
  profile.savedRun = serialiseRun();
  persistProfile();
  syncProfileUi();
}

function beginRun(mode, seed, saved = null) {
  run = createRun(mode, seed, saved);
  world.reset(run.seed, { passed: run.passed, grazed: run.grazed });
  world.updateChunks(run.flight.z);
  phase = 'running';
  clearInput();
  setHidden(elements.menu, true);
  setHidden(elements.briefing, true);
  setHidden(elements.pauseOverlay, true);
  setHidden(elements.resultOverlay, true);
  closeSettings();
  setFlightChrome(true);
  elements.modeLabel.textContent = mode === 'daily' ? `МАРШРУТ ДНЯ / ${routeCode(seed)}` : `СВОБОДНЫЙ / ${routeCode(seed)}`;
  snapCameraTo(run.flight);
  audio.setRunning(true);
  runEndedAt = 0;
  saveActiveRun();
}

async function requestLaunch(mode) {
  await audio.unlock();
  audio.setEnabled(profile.settings.sound);
  const seed = mode === 'daily' ? todaySeed : randomSeed();
  pendingLaunch = { mode, seed };
  if (!profile.tutorialSeen) {
    phase = 'briefing';
    setHidden(elements.briefing, false);
    elements.briefingStart.focus({ preventScroll: true });
    return;
  }
  beginRun(mode, seed);
}

function showBriefing() {
  pendingLaunch = { mode: 'free', seed: randomSeed() };
  phase = 'briefing';
  setHidden(elements.briefing, false);
  elements.briefingStart.focus({ preventScroll: true });
}

function closeBriefing() {
  setHidden(elements.briefing, true);
  phase = 'menu';
  pendingLaunch = null;
}

function pauseRun(silent = false) {
  if (phase !== 'running' || !run) return;
  phase = 'paused';
  clearInput();
  audio.setRunning(false);
  saveActiveRun();
  elements.pauseDistance.textContent = `${Math.floor(run.flight.z)} м`;
  elements.pauseScore.textContent = Math.floor(run.score).toLocaleString('ru-RU');
  elements.pauseCombo.textContent = `×${run.combo}`;
  setHidden(elements.pauseOverlay, false);
  setHidden(elements.diveButton, true);
  if (!silent) audio.event('ui');
}

function continueRun() {
  if (phase !== 'paused' || !run) return;
  phase = 'running';
  setHidden(elements.pauseOverlay, true);
  setHidden(elements.diveButton, false);
  audio.setRunning(true);
  previousFrame = performance.now();
  audio.event('ui');
}

function enterMenu(options = {}) {
  if (options.clearSaved !== false) {
    profile.savedRun = null;
    persistProfile();
  }
  phase = 'menu';
  run = null;
  clearInput();
  audio.setRunning(false);
  setFlightChrome(false);
  setHidden(elements.menu, false);
  setHidden(elements.briefing, true);
  setHidden(elements.pauseOverlay, true);
  setHidden(elements.resultOverlay, true);
  closeSettings();
  elements.stage.classList.remove('is-flowing', 'is-boosting');
  demoTime = 0;
  demoFlight = createFlightState();
  const demoCourse = courseAt(0, todaySeed);
  demoFlight.x = demoCourse.center;
  demoFlight.y = demoCourse.floor + 14;
  world.reset(todaySeed);
  snapCameraTo(demoFlight, true);
  syncProfileUi();
}

const crashCopy = {
  floor: {
    kicker: 'СНЕГ ОКАЗАЛСЯ БЛИЖЕ',
    title: 'Рельеф победил.',
    note: 'Набрать скорость на пикировании — хорошая идея. Вспомнить выйти из него — ещё лучше.',
  },
  wall: {
    kicker: 'КОНТАКТ С РЕЛЬЕФОМ',
    title: 'Гора не уступила.',
    note: 'Самолёт задел стену разлома. Рамка близости предупреждала, но гора оказалась убедительнее.',
  },
  needle: {
    kicker: 'СКАЛЬНАЯ ИГЛА / ПРЯМОЕ ПОПАДАНИЕ',
    title: 'Очень точный промах.',
    note: 'Игла стояла там тысячи лет. Сложно обвинить её в резком манёвре.',
  },
};

function finishRun(reason = 'wall') {
  if (!run || phase === 'result') return;
  phase = 'result';
  clearInput();
  audio.setRunning(false);
  audio.event('fail');
  haptic([28, 40, 60]);
  profile.savedRun = null;
  profile.flights += 1;
  const distance = Math.max(0, Math.floor(run.flight.z));
  const score = Math.max(0, Math.floor(run.score));
  const distanceRecord = distance > profile.bestDistance;
  const scoreRecord = score > profile.bestScore;
  profile.bestDistance = Math.max(profile.bestDistance, distance);
  profile.bestScore = Math.max(profile.bestScore, score);
  if (run.mode === 'daily') {
    const previous = profile.daily[todayKey] || { score: 0, distance: 0 };
    profile.daily[todayKey] = {
      score: Math.max(previous.score, score),
      distance: Math.max(previous.distance, distance),
    };
  }
  persistProfile();
  syncProfileUi();

  const copy = crashCopy[reason] || crashCopy.wall;
  elements.resultKicker.textContent = copy.kicker;
  elements.resultTitle.textContent = copy.title;
  elements.resultScore.textContent = score.toLocaleString('ru-RU');
  elements.resultDistance.textContent = `${distance} м`;
  elements.resultGates.textContent = String(run.gates);
  elements.resultNear.textContent = String(run.nearMisses);
  elements.resultCombo.textContent = `×${run.maxCombo}`;
  elements.resultNote.textContent = copy.note;
  setHidden(elements.newRecord, !(distanceRecord || scoreRecord));
  setHidden(elements.resultOverlay, false);
  setFlightChrome(false);
  runEndedAt = performance.now();
  pulse(elements.impactFlash);
}

function restartCurrentRun() {
  if (!run) return;
  const { mode, seed } = run;
  beginRun(mode, seed);
}

function addReward(base, flowGain, title, subtitle, type = 'near') {
  if (!run) return;
  run.combo = clamp(run.combo + 1, 1, 99);
  run.maxCombo = Math.max(run.maxCombo, run.combo);
  run.comboTime = COMBO_DURATION;
  const flowing = run.flowTime > 0;
  const points = awardScore(base, run.combo, flowing);
  run.score += points;
  run.flow = clamp(run.flow + flowGain, 0, 100);
  showCallout(title, `${subtitle} · +${points}`);
  audio.event(type, clamp(flowGain / 18, 0.4, 1));
  haptic(type === 'gate' ? [7, 25, 7] : 7);
  if (run.flow >= 100 && run.flowTime <= 0) {
    run.flow = 0;
    run.flowTime = FLOW_DURATION;
    run.score += awardScore(180, run.combo, true);
    pulse(elements.flowFlash);
    showCallout('ВОЗДУШНЫЙ ПРОРЫВ', 'очки ×2 · держи линию');
    audio.event('flow');
    haptic([10, 28, 10, 28, 18]);
  }
}

function applyDamage(amount, reason) {
  if (!run) return false;
  const now = performance.now() / 1000;
  if (now - run.lastDamageTime < 0.72) return false;
  run.lastDamageTime = now;
  const flowing = run.flowTime > 0;
  run.integrity = Math.max(0, run.integrity - amount * (flowing ? 0.62 : 1));
  run.flow = Math.max(0, run.flow - 28);
  run.flowTime = Math.max(0, run.flowTime - 1.4);
  run.combo = 1;
  run.comboTime = 0;
  run.flight.speed = Math.max(18, run.flight.speed - 8);
  shake = Math.min(1.25, shake + 0.82);
  pulse(elements.impactFlash);
  audio.event('hit');
  haptic([24, 34, 18]);
  if (run.integrity <= 0) {
    finishRun(reason);
    return true;
  }
  world.markImpact();
  showCallout('КОРПУС ПОВРЕЖДЁН', `${Math.ceil(run.integrity)}% прочности`);
  return true;
}

function updateProximity(clearance, obstacleDistance = Infinity) {
  if (!clearance || !elements.proximityFrame) return;
  const wallOpacity = (distance) => clamp((3.4 - distance) / 2.7, 0, 1);
  elements.proximityLeft.style.opacity = String(wallOpacity(clearance.left));
  elements.proximityRight.style.opacity = String(wallOpacity(clearance.right));
  elements.proximityFloor.style.opacity = String(wallOpacity(clearance.floor));
  const danger = Math.min(clearance.minimum - AIRCRAFT_CORE_RADIUS, obstacleDistance);
  elements.proximityFrame.classList.toggle('is-danger', danger < 0.8);
  elements.proximityFrame.classList.toggle('is-close', danger >= 0.8 && danger < 1.8);
}

function checkCourseEvents(previousState) {
  if (!run || phase !== 'running') return null;
  const state = run.flight;
  const course = courseAt(state.z, run.seed);
  const clearance = canyonClearance(state, course);

  if (clearance.minimum < AIRCRAFT_CORE_RADIUS) {
    let reason = 'wall';
    if (clearance.floor <= clearance.left && clearance.floor <= clearance.right) {
      reason = 'floor';
      state.y = course.floor + 1.1 + AIRCRAFT_CORE_RADIUS;
      state.vy = Math.max(2.8, Math.abs(state.vy) * 0.28);
    } else if (clearance.left < clearance.right) {
      state.x = course.center - course.width + AIRCRAFT_CORE_RADIUS;
      state.vx = Math.abs(state.vx) * 0.32 + 1.8;
    } else {
      state.x = course.center + course.width - AIRCRAFT_CORE_RADIUS;
      state.vx = -Math.abs(state.vx) * 0.32 - 1.8;
    }
    applyDamage(38, reason);
    if (phase !== 'running') return null;
  }

  const ceiling = course.floor + 40;
  if (state.y > ceiling) {
    state.y = ceiling;
    state.vy = Math.min(state.vy, -2.4);
    const zone = Math.floor(state.z / 120);
    if (zone !== run.altitudeWarningZone) {
      run.altitudeWarningZone = zone;
      showCallout('ВОЗДУХ СЛИШКОМ ТОНКИЙ', 'вернись в разлом');
    }
  }

  const nearby = world.nearby(state.z, 12);
  let nearestObstacle = Infinity;
  for (const gate of nearby.gates) {
    if (run.passed.has(gate.id) || previousState.z > gate.z || state.z < gate.z) continue;
    const hit = gateHit(previousState, state, gate);
    run.passed.add(gate.id);
    world.markGate(gate.id);
    if (hit) {
      run.gates += 1;
      run.integrity = Math.min(100, run.integrity + 2.5);
      addReward(115, 19, 'СТВОР ПРОЙДЕН', `серия ×${run.combo + 1}`, 'gate');
    } else if (run.combo > 1) {
      run.combo = 1;
      run.comboTime = 0;
    }
  }

  for (const obstacle of nearby.obstacles) {
    const contact = sweptObstacleClearance(previousState, state, obstacle);
    const obstacleDistance = contact.clearance;
    nearestObstacle = Math.min(nearestObstacle, obstacleDistance);
    if (obstacleDistance < 0) {
      const side = contact.x >= obstacle.x ? 1 : -1;
      state.x += side * Math.max(0.48, Math.abs(obstacleDistance) + 0.24);
      state.vx += side * 4.2;
      state.y += 0.22;
      if (applyDamage(46, 'needle') && phase !== 'running') return null;
    } else if (
      previousState.z <= obstacle.z + 1.3 && state.z >= obstacle.z - 1.3 &&
      obstacleDistance < 2.2 &&
      !run.grazed.has(obstacle.id)
    ) {
      run.grazed.add(obstacle.id);
      world.markGrazed(obstacle.id);
      run.nearMisses += 1;
      addReward(82, 12, 'В ПОЛУМЕТРЕ', `скальная игла · серия ×${run.combo + 1}`);
    }
  }

  const closestWall = Math.min(clearance.left, clearance.right, clearance.floor);
  if (closestWall > AIRCRAFT_CORE_RADIUS + 0.12 && closestWall < 2.35 && state.speed > 29) {
    const side = clearance.floor <= clearance.left && clearance.floor <= clearance.right
      ? 'f'
      : clearance.left < clearance.right ? 'l' : 'r';
    const zoneId = `c:${Math.floor(state.z / 24)}:${side}`;
    if (!run.grazed.has(zoneId)) {
      run.grazed.add(zoneId);
      world.markGrazed(zoneId);
      run.nearMisses += 1;
      addReward(48, 7, side === 'f' ? 'БРЕЮЩИЙ ПОЛЁТ' : 'ПО КРОМКЕ', `серия ×${run.combo + 1}`);
    }
  }
  return { clearance, nearestObstacle };
}

function updateRun(delta, time) {
  if (!run) return;
  const state = run.flight;
  const previousState = { ...state };
  const keyboardX = (input.keys.has('ArrowRight') || input.keys.has('KeyD') ? 1 : 0) - (input.keys.has('ArrowLeft') || input.keys.has('KeyA') ? 1 : 0);
  const keyboardY = (input.keys.has('ArrowDown') || input.keys.has('KeyS') ? 1 : 0) - (input.keys.has('ArrowUp') || input.keys.has('KeyW') ? 1 : 0);
  const steeringX = keyboardX || input.x;
  const steeringY = keyboardY || input.y;
  const boosted = input.boosted || input.keys.has('Space');
  const difficulty = progressDifficulty(state.z);
  const course = courseAt(state.z, run.seed);
  stepFlight(state, {
    x: steeringX,
    y: steeringY,
    boosted,
    sensitivity: profile.settings.sensitivity,
  }, delta, course, difficulty);

  if (run.flowTime > 0) {
    run.flowTime = Math.max(0, run.flowTime - delta);
    state.speed = damp(state.speed, Math.max(44, state.speed), 5, delta);
  }
  if (run.comboTime > 0) {
    run.comboTime = Math.max(0, run.comboTime - delta);
    if (run.comboTime <= 0) run.combo = 1;
  }

  const proximity = checkCourseEvents(previousState);
  if (phase !== 'running') return;
  const flowing = run.flowTime > 0;
  const visual = world.getVisualProfile(state.z);
  if (visual.zone !== run.biomeZone) {
    if (run.biomeZone >= 0) showCallout(visual.label, 'новый участок маршрута');
    run.biomeZone = visual.zone;
  }
  if (boosted && !run.wasBoosted) audio.event('boost');
  run.wasBoosted = boosted;
  run.score += state.speed * delta * 0.72 * comboMultiplier(run.combo) * (flowing ? 2 : 1);
  world.update(state, {
    delta,
    time,
    boosted,
    flowing,
    effects: profile.settings.effects && !reducedMotion.matches,
  });
  updateCamera(state, delta, flowing, boosted);
  updateMood(state.z, delta);
  updateHud(boosted);
  updateProximity(proximity?.clearance, proximity?.nearestObstacle);
  audio.update(state.speed, boosted, flowing);

  if (time - run.lastSaveTime > 2.2) {
    run.lastSaveTime = time;
    saveActiveRun();
  }
}

function updateDemo(delta, time) {
  demoTime += delta;
  demoFlight.z += delta * (reducedMotion.matches ? 4 : 12);
  const current = courseAt(demoFlight.z, todaySeed);
  const ahead = courseAt(demoFlight.z + 7, todaySeed);
  const targetX = current.center + Math.sin(demoTime * 0.47) * current.width * 0.26;
  const targetY = current.floor + 13.2 + Math.sin(demoTime * 0.34) * 2.4;
  const oldX = demoFlight.x;
  const oldY = demoFlight.y;
  demoFlight.x = damp(demoFlight.x, targetX, 1.4, delta);
  demoFlight.y = damp(demoFlight.y, targetY, 1.2, delta);
  demoFlight.vx = (demoFlight.x - oldX) / Math.max(0.001, delta);
  demoFlight.vy = (demoFlight.y - oldY) / Math.max(0.001, delta);
  demoFlight.speed = 26;
  demoFlight.bank = damp(demoFlight.bank, -demoFlight.vx * 0.047, 3, delta);
  demoFlight.pitch = damp(demoFlight.pitch, demoFlight.vy * 0.035, 3, delta);
  world.update(demoFlight, {
    delta,
    time,
    boosted: false,
    flowing: false,
    effects: profile.settings.effects && !reducedMotion.matches,
  });
  const targetState = { ...demoFlight, x: lerp(demoFlight.x, ahead.center, 0.12) };
  updateCamera(targetState, delta, false, false, true);
  updateMood(demoFlight.z % 1200, delta);
  audio.update(0, false, false);
}

function updateStaticWorld(delta, time) {
  if (!run) return;
  world.update(run.flight, {
    delta,
    time,
    boosted: false,
    flowing: false,
    effects: profile.settings.effects && !reducedMotion.matches,
  });
  updateCamera(run.flight, delta, false, false);
  updateMood(run.flight.z, delta);
  audio.update(0, false, false);
}

function updateCamera(state, delta, flowing, boosted, demo = false) {
  const speedPull = clamp((state.speed - 26) / 24, 0, 1);
  const desired = {
    x: state.x - state.vx * 0.045,
    y: state.y + (demo ? 3.45 : 3.05) - state.vy * 0.025,
    z: state.z - 9.25 - speedPull * 2.15,
    tx: state.x + state.vx * 0.11,
    ty: state.y + 0.12 + state.vy * 0.1,
    tz: state.z + 15 + speedPull * 5,
    fov: (flowing ? Math.PI * 0.455 : boosted ? Math.PI * 0.41 : Math.PI * 0.37),
    roll: clamp(state.bank * 0.2, -0.13, 0.13),
  };
  const cameraSmooth = demo ? 1.8 : 5.6;
  cameraState.x = damp(cameraState.x, desired.x, cameraSmooth, delta);
  cameraState.y = damp(cameraState.y, desired.y, cameraSmooth, delta);
  cameraState.z = damp(cameraState.z, desired.z, cameraSmooth, delta);
  cameraState.tx = damp(cameraState.tx, desired.tx, cameraSmooth * 1.15, delta);
  cameraState.ty = damp(cameraState.ty, desired.ty, cameraSmooth * 1.15, delta);
  cameraState.tz = damp(cameraState.tz, desired.tz, cameraSmooth * 1.15, delta);
  cameraState.fov = damp(cameraState.fov, desired.fov, 4.2, delta);
  cameraState.roll = damp(cameraState.roll || 0, desired.roll, demo ? 1.8 : 4.5, delta);
  shake = damp(shake, 0, 7.5, delta);
  const jitterX = (Math.random() - 0.5) * shake;
  const jitterY = (Math.random() - 0.5) * shake;
  engine.camera.position = [cameraState.x + jitterX, cameraState.y + jitterY, cameraState.z];
  engine.camera.target = [cameraState.tx, cameraState.ty, cameraState.tz];
  engine.camera.up = [Math.sin(cameraState.roll), Math.cos(cameraState.roll), 0];
  engine.camera.fov = cameraState.fov;
}

function snapCameraTo(state, demo = false) {
  cameraState = {
    x: state.x,
    y: state.y + (demo ? 3.45 : 3.05),
    z: state.z - 9.25,
    tx: state.x,
    ty: state.y + 0.12,
    tz: state.z + 15,
    fov: Math.PI * 0.37,
    roll: 0,
  };
  if (!engine) return;
  engine.camera.position = [cameraState.x, cameraState.y, cameraState.z];
  engine.camera.target = [cameraState.tx, cameraState.ty, cameraState.tz];
  engine.camera.up = [0, 1, 0];
  engine.camera.fov = cameraState.fov;
}

function updateMood(distance, delta) {
  const visual = world.getVisualProfile(distance);
  const distanceMood = clamp(distance / 4200, 0, 1);
  const targetFog = visual.fog.map((channel, index) => channel - distanceMood * (index === 2 ? 0.025 : 0.045));
  for (let index = 0; index < 3; index += 1) {
    engine.fogColor[index] = damp(engine.fogColor[index], targetFog[index], 0.62, delta);
  }
  engine.fogNear = damp(engine.fogNear, visual.id === 'basalt' ? 34 : visual.id === 'glacier' ? 62 : 52, 0.52, delta);
  engine.fogFar = damp(engine.fogFar, visual.id === 'basalt' ? 125 : visual.id === 'glacier' ? 185 : 164, 0.52, delta);
  const rgb = (color) => `rgb(${color.map((channel) => Math.round(channel * 255)).join(' ')})`;
  elements.stage.style.background = `linear-gradient(180deg, ${rgb(visual.skyTop)} 0%, ${rgb(visual.skyHorizon)} 55%, ${rgb(visual.fog)} 100%)`;
  elements.stage.dataset.biome = visual.id;
  elements.biomeLabel.textContent = visual.label;
  elements.sun.style.background = rgb(visual.sun);
  elements.sun.style.boxShadow = `0 0 86px color-mix(in srgb, ${rgb(visual.sun)} 54%, transparent)`;
  elements.sun.style.opacity = String(visual.id === 'basalt' ? 0.38 : 0.72);
}

function updateHud(boosted) {
  if (!run) return;
  const distance = Math.max(0, Math.floor(run.flight.z));
  const integrity = Math.ceil(run.integrity);
  const flowing = run.flowTime > 0;
  const displayedFlow = flowing ? run.flowTime / FLOW_DURATION * 100 : run.flow;
  elements.distanceValue.textContent = String(distance);
  elements.integrityValue.textContent = String(integrity);
  elements.integrityFill.style.height = `${run.integrity}%`;
  elements.integrityBlock.classList.toggle('is-critical', run.integrity <= 30);
  elements.scoreValue.textContent = Math.floor(run.score).toString().padStart(6, '0');
  elements.speedValue.textContent = String(Math.round(run.flight.speed * 3.6));
  elements.comboBlock.classList.toggle('is-active', run.combo > 1);
  elements.comboValue.textContent = `×${run.combo}`;
  elements.comboLabel.textContent = flowing ? 'ПРОРЫВ / ДВОЙНОЙ СЧЁТ' : run.combo >= 6 ? 'ОСТРАЯ СЕРИЯ' : 'ЧИСТЫЙ ВОЗДУХ';
  elements.comboTimer.style.transform = `scaleX(${run.combo > 1 ? run.comboTime / COMBO_DURATION : 0})`;
  elements.flowFill.style.width = `${displayedFlow}%`;
  elements.flowValue.textContent = flowing ? String(Math.ceil(run.flowTime)) : String(Math.floor(run.flow));
  elements.flowBlock.classList.toggle('is-ready', flowing || run.flow >= 82);
  elements.stage.classList.toggle('is-boosting', boosted && !flowing);
  elements.stage.classList.toggle('is-flowing', flowing);
  elements.diveButton.classList.toggle('is-flow', flowing);
  elements.diveButton.classList.toggle('is-held', boosted);
  elements.diveLabel.textContent = flowing ? 'ПРОРЫВ' : boosted ? 'ФОРСАЖ' : 'ФОРСАЖ';
}

function failWebGl(error) {
  console.error('ХРЕБЕТ: WebGL failed', error);
  phase = 'error';
  cancelAnimationFrame(frameHandle);
  setHidden(elements.loading, true);
  setHidden(elements.menu, true);
  setFlightChrome(false);
  setHidden(elements.fallback, false);
  audio.setRunning(false);
}

function frame(now) {
  const delta = clamp((now - previousFrame) / 1000, 0, 0.05);
  previousFrame = now;
  const time = now / 1000;
  try {
    if (phase === 'running') updateRun(delta, time);
    else if (['loading', 'menu', 'briefing'].includes(phase)) updateDemo(delta, time);
    else if (['paused', 'result'].includes(phase)) updateStaticWorld(delta, time);
    engine.render(time);
    frameHandle = requestAnimationFrame(frame);
  } catch (error) {
    failWebGl(error);
  }
}

function pointerCoordinates(event) {
  const rect = elements.canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width, height: rect.height };
}

elements.canvas.addEventListener('pointerdown', (event) => {
  if (phase !== 'running' || input.pointerId !== null) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  event.preventDefault();
  const point = pointerCoordinates(event);
  input.pointerId = event.pointerId;
  input.startX = point.x;
  input.startY = point.y;
  input.x = 0;
  input.y = 0;
  elements.canvas.setPointerCapture?.(event.pointerId);
  elements.steerCursor.style.left = `${point.x}px`;
  elements.steerCursor.style.top = `${point.y}px`;
  elements.steerCursor.classList.add('is-visible');
});

elements.canvas.addEventListener('pointermove', (event) => {
  if (phase !== 'running' || input.pointerId !== event.pointerId) return;
  event.preventDefault();
  const point = pointerCoordinates(event);
  input.x = clamp((point.x - input.startX) / Math.max(70, point.width * 0.24), -1, 1);
  input.y = clamp((point.y - input.startY) / Math.max(70, point.height * 0.27), -1, 1);
  elements.steerCursor.style.left = `${point.x}px`;
  elements.steerCursor.style.top = `${point.y}px`;
});

function endSteering(event) {
  if (input.pointerId !== event.pointerId) return;
  input.pointerId = null;
  input.x = 0;
  input.y = 0;
  elements.steerCursor.classList.remove('is-visible');
  try { elements.canvas.releasePointerCapture?.(event.pointerId); } catch { /* capture already gone */ }
}

for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  elements.canvas.addEventListener(type, endSteering);
}

elements.diveButton.addEventListener('pointerdown', (event) => {
  if (phase !== 'running') return;
  event.preventDefault();
  input.boosted = true;
  elements.diveButton.classList.add('is-held');
  elements.diveButton.setPointerCapture?.(event.pointerId);
});

function endDive(event) {
  input.boosted = false;
  elements.diveButton.classList.remove('is-held');
  try { elements.diveButton.releasePointerCapture?.(event.pointerId); } catch { /* no capture */ }
}

for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  elements.diveButton.addEventListener(type, endDive);
}

window.addEventListener('keydown', (event) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
    if (phase === 'running') event.preventDefault();
    input.keys.add(event.code);
  }
  if (event.code === 'Escape' && phase === 'running') pauseRun();
});

window.addEventListener('keyup', (event) => input.keys.delete(event.code));
window.addEventListener('blur', clearInput);

elements.startButton.addEventListener('click', () => requestLaunch('free'));
elements.dailyButton.addEventListener('click', () => requestLaunch('daily'));
elements.resumeButton.addEventListener('click', async () => {
  const saved = sanitizeSavedRun(profile.savedRun);
  if (!saved) {
    profile.savedRun = null;
    persistProfile();
    syncProfileUi();
    return;
  }
  await audio.unlock();
  beginRun(saved.mode, saved.seed, saved);
});
elements.howButton.addEventListener('click', showBriefing);
elements.briefingClose.addEventListener('click', closeBriefing);
elements.briefingStart.addEventListener('click', async () => {
  if (!pendingLaunch) pendingLaunch = { mode: 'free', seed: randomSeed() };
  await audio.unlock();
  profile.tutorialSeen = true;
  persistProfile();
  const launch = pendingLaunch;
  pendingLaunch = null;
  beginRun(launch.mode, launch.seed);
});

elements.pauseButton.addEventListener('click', () => pauseRun());
elements.continueButton.addEventListener('click', continueRun);
elements.pauseRestartButton.addEventListener('click', restartCurrentRun);
elements.pauseSettingsButton.addEventListener('click', openSettings);
elements.pauseMenuButton.addEventListener('click', () => enterMenu());
elements.againButton.addEventListener('click', () => {
  if (performance.now() - runEndedAt < 180) return;
  restartCurrentRun();
});
elements.resultMenuButton.addEventListener('click', () => enterMenu());

elements.settingsButton.addEventListener('click', openSettings);
elements.settingsClose.addEventListener('click', closeSettings);
elements.settingsBackdrop.addEventListener('click', closeSettings);
elements.soundSetting.addEventListener('click', async () => {
  profile.settings.sound = !profile.settings.sound;
  if (profile.settings.sound) await audio.unlock();
  audio.setEnabled(profile.settings.sound);
  persistProfile();
  syncSettingsUi();
  audio.event('ui');
});
elements.hapticSetting.addEventListener('click', () => {
  profile.settings.haptics = !profile.settings.haptics;
  persistProfile();
  syncSettingsUi();
  haptic(8);
  audio.event('ui');
});
elements.sensitivitySetting.addEventListener('click', () => {
  profile.settings.sensitivity = profile.settings.sensitivity === 0.75 ? 1 : profile.settings.sensitivity === 1 ? 1.25 : 0.75;
  persistProfile();
  syncSettingsUi();
  audio.event('ui');
});
elements.effectsSetting.addEventListener('click', () => {
  profile.settings.effects = !profile.settings.effects;
  persistProfile();
  syncSettingsUi();
  audio.event('ui');
});
elements.resetButton.addEventListener('click', () => {
  const now = Date.now();
  if (now > resetArmedUntil) {
    resetArmedUntil = now + 4000;
    elements.resetButton.dataset.armed = 'true';
    elements.resetButton.textContent = 'Нажми ещё раз для сброса';
    window.setTimeout(() => {
      if (Date.now() < resetArmedUntil) return;
      delete elements.resetButton.dataset.armed;
      elements.resetButton.textContent = 'Сбросить рекорды';
    }, 4100);
    return;
  }
  resetArmedUntil = 0;
  profile.bestDistance = 0;
  profile.bestScore = 0;
  profile.flights = 0;
  profile.daily = {};
  persistProfile();
  syncProfileUi();
  delete elements.resetButton.dataset.armed;
  elements.resetButton.textContent = 'Рекорды сброшены';
  window.setTimeout(() => { elements.resetButton.textContent = 'Сбросить рекорды'; }, 1100);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && phase === 'running') pauseRun(true);
});
window.addEventListener('pagehide', saveActiveRun);
window.addEventListener('appviewportchange', () => engine?.resize());
window.addEventListener('workshopopen', () => {
  if (phase === 'running') pauseRun(true);
});

elements.canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  failWebGl(new Error('WebGL context lost'));
});

createWorkshopMode({
  appName: 'ХРЕБЕТ',
  version: '1.1.0',
  cachePrefix: 'khrebet-',
  storageNamespace: 'pocket-works:khrebet',
  onReset() {
    profile = freshProfile();
    persistProfile();
    audio.setEnabled(profile.settings.sound);
    if (engine && world) enterMenu();
    syncProfileUi();
  },
});

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});

async function initialise() {
  try {
    elements.loadingCopy.textContent = 'строим скальные кромки';
    engine = new RidgeEngine(elements.canvas);
    engine.dprLimit = profile.settings.effects ? 1.7 : 1.2;
    world = new RidgeWorld(engine, todaySeed);
    const startCourse = courseAt(0, todaySeed);
    demoFlight.x = startCourse.center;
    demoFlight.y = startCourse.floor + 14;
    snapCameraTo(demoFlight, true);
    world.updateChunks(0);
    syncProfileUi();
    frameHandle = requestAnimationFrame(frame);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    elements.loading.classList.add('is-gone');
    window.setTimeout(() => setHidden(elements.loading, true), 420);
    phase = 'menu';
    setFlightChrome(false);
  } catch (error) {
    failWebGl(error);
  }
}

initialise();
