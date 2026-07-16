import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  RUN_SAVE_VERSION,
  airframeCanyonClearance,
  awardScore,
  clamp,
  comboMultiplier,
  courseAt,
  createFlightState,
  dailySeed,
  damageIntegrity,
  damp,
  freshProfile,
  gateHit,
  impactSeverity,
  lerp,
  progressDifficulty,
  routeCode,
  sanitizeDamage,
  sanitizeProfile,
  sanitizeSavedRun,
  stepFlight,
  sweptAirframeClearance,
  virtualStickInput,
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
  damageLeft: byId('damageLeft'),
  damageRight: byId('damageRight'),
  damageNose: byId('damageNose'),
  damageFold: byId('damageFold'),
  stallWarning: byId('stallWarning'),
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
  assistSetting: byId('assistSetting'),
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
  controlX: 0,
  controlY: 0,
  folded: false,
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
  for (const element of [elements.flightHeader, elements.flightHud, elements.speedTape, elements.diveButton, elements.stallWarning]) {
    setHidden(element, !visible);
  }
  if (!visible) elements.stallWarning?.classList.remove('is-visible');
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
  elements.assistSetting.querySelector('i').textContent = settings.flightAssist ? 'ВКЛ' : 'ВЫКЛ';
  elements.assistSetting.dataset.off = String(!settings.flightAssist);
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
  input.controlX = 0;
  input.controlY = 0;
  input.folded = false;
  input.keys.clear();
  elements.stage.style.setProperty('--steer-x', '0px');
  elements.stage.style.setProperty('--steer-y', '0px');
  elements.steerCursor.style.setProperty('--stick-x', '0px');
  elements.steerCursor.style.setProperty('--stick-y', '0px');
  elements.steerCursor.classList.remove('is-visible');
  elements.diveButton.classList.remove('is-held');
  elements.stage.classList.remove('is-boosting');
}

function createRun(mode, seed, saved = null) {
  const restored = saved ? sanitizeSavedRun(saved) : null;
  const flight = restored ? { ...restored.flight } : createFlightState();
  const damage = sanitizeDamage(restored?.damage);
  const initialCourse = courseAt(flight.z, seed);
  if (!restored) {
    flight.x = initialCourse.center;
    flight.y = initialCourse.floor + 18.5;
  }
  return {
    seed: seed >>> 0,
    mode,
    flight,
    score: restored?.score || 0,
    damage,
    integrity: damageIntegrity(damage),
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
    segmentZone: -1,
    wasFolded: false,
    wasStalling: false,
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
    damage: { ...run.damage },
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
    kicker: 'ЖЁСТКАЯ ПОСАДКА БЕЗ ПОСАДКИ',
    title: 'Бумага встретила камень.',
    note: 'Сложенные крылья хорошо разгоняют самолётик, но почти не создают подъёмной силы.',
  },
  wall: {
    kicker: 'КОНТАКТ С РЕЛЬЕФОМ',
    title: 'Сгиб не выдержал.',
    note: 'Касание крылом ещё можно пережить. Удар центральным сгибом о склон — обычно уже нет.',
  },
  needle: {
    kicker: 'СКАЛЬНАЯ ИГЛА / ПРЯМОЕ ПОПАДАНИЕ',
    title: 'Очень точный промах.',
    note: 'Игла стояла там тысячи лет. Сложно обвинить её в резком манёвре.',
  },
  boulder: {
    kicker: 'КАМЕННЫЙ ДОЖДЬ / ПРЯМОЕ ПОПАДАНИЕ',
    title: 'Камень оказался тяжелее.',
    note: 'Подвешенные валуны читаются по тени и силуэту. Нос бумажного самолётика — плохой таран.',
  },
  cable: {
    kicker: 'СТАРАЯ РАСТЯЖКА / РАЗРЕЗ КРЫЛА',
    title: 'Кромка распустилась.',
    note: 'Тонкие тросы наносят меньше общего урона, но легко режут край крыла и портят баланс.',
  },
  beam: {
    kicker: 'КАМЕННАЯ КОНСТРУКЦИЯ / УДАР',
    title: 'Проём был чуть в стороне.',
    note: 'Арки и нависающие полки оставляют честный проход, но не прощают удара носом или сгибом.',
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

const damageCopy = {
  leftWing: ['ЗАМЯТО ЛЕВОЕ КРЫЛО', 'НАДРЫВ ЛЕВОГО КРЫЛА', 'ЛЕВАЯ КРОМКА РАЗРУШЕНА'],
  rightWing: ['ЗАМЯТО ПРАВОЕ КРЫЛО', 'НАДРЫВ ПРАВОГО КРЫЛА', 'ПРАВАЯ КРОМКА РАЗРУШЕНА'],
  nose: ['СМЯТ НОС', 'НОС РАЗМОЧАЛЕН', 'НОСОВАЯ СКЛАДКА РАЗРУШЕНА'],
  fold: ['ПРОДАВЛЕН СГИБ', 'ЦЕНТРАЛЬНЫЙ СГИБ ЛОПНУЛ', 'КАРКАС ПОТЕРЯН'],
};

function applyDamage({ amount, zone = 'fold', reason = 'wall', source = 'terrain' }) {
  if (!run) return false;
  const now = performance.now() / 1000;
  if (now - run.lastDamageTime < 0.46) return false;
  run.lastDamageTime = now;
  const target = Object.hasOwn(run.damage, zone) ? zone : 'fold';
  const previous = run.damage[target];
  run.damage[target] = Math.max(0, previous - amount);
  if (target === 'leftWing' || target === 'rightWing') {
    run.damage.fold = Math.max(0, run.damage.fold - amount * 0.12);
  } else if (target === 'nose') {
    run.damage.fold = Math.max(0, run.damage.fold - amount * 0.18);
  }
  run.integrity = damageIntegrity(run.damage);
  run.flow = Math.max(0, run.flow - 28);
  run.flowTime = Math.max(0, run.flowTime - 1.4);
  run.combo = 1;
  run.comboTime = 0;
  const speedLoss = target === 'nose' ? amount * 0.18 : target === 'fold' ? amount * 0.12 : amount * 0.065;
  run.flight.speed = Math.max(10, run.flight.speed - speedLoss);
  if (target === 'leftWing') run.flight.rollRate -= 0.24 + amount * 0.012;
  if (target === 'rightWing') run.flight.rollRate += 0.24 + amount * 0.012;
  if (target === 'nose') run.flight.pitchRate -= 0.18 + amount * 0.009;
  if (target === 'fold') run.flight.stall = Math.min(1, run.flight.stall + amount * 0.012);
  shake = Math.min(1.35, shake + 0.34 + amount / 46);
  pulse(elements.impactFlash);
  audio.event(amount < 15 ? 'hit-light' : amount >= 34 ? 'hit-heavy' : 'hit', clamp(amount / 42, 0.25, 1));
  haptic(amount < 15 ? 12 : amount < 32 ? [18, 28, 14] : [30, 32, 24, 36, 18]);
  world.markImpact(target);

  const fatal = run.damage.fold <= 0 || run.damage.nose <= 0 ||
    (run.damage.leftWing <= 3 && run.damage.rightWing <= 3) || run.integrity <= 7;
  if (fatal) {
    finishRun(reason);
    return true;
  }

  const ratio = run.damage[target] / 100;
  const tier = ratio <= 0.22 ? 2 : ratio <= 0.58 ? 1 : 0;
  const material = source === 'cable' ? 'режущий контакт' : source === 'boulder' ? 'тяжёлый удар' : amount < 15 ? 'касание' : 'жёсткий контакт';
  showCallout(damageCopy[target][tier], `−${Math.round(previous - run.damage[target])}% · ${material}`);
  return true;
}

function updateProximity(clearance, obstacleDistance = Infinity) {
  if (!clearance || !elements.proximityFrame) return;
  const wallOpacity = (distance) => clamp((3.4 - distance) / 2.7, 0, 1);
  elements.proximityLeft.style.opacity = String(wallOpacity(clearance.left));
  elements.proximityRight.style.opacity = String(wallOpacity(clearance.right));
  elements.proximityFloor.style.opacity = String(wallOpacity(clearance.floor));
  const danger = Math.min(clearance.minimum, obstacleDistance);
  elements.proximityFrame.classList.toggle('is-danger', danger < 0.8);
  elements.proximityFrame.classList.toggle('is-close', danger >= 0.8 && danger < 1.8);
}

function checkCourseEvents(previousState) {
  if (!run || phase !== 'running') return null;
  const state = run.flight;
  const course = courseAt(state.z, run.seed);
  const clearance = airframeCanyonClearance(state, course);

  if (clearance.minimum < 0) {
    const reason = clearance.side === 'floor' ? 'floor' : 'wall';
    const penetration = Math.max(0.05, -clearance.minimum + 0.05);
    if (clearance.side === 'floor') {
      state.y += penetration;
      state.vy = Math.max(1.4, Math.abs(state.vy) * 0.22);
    } else if (clearance.side === 'left') {
      state.x += penetration;
      state.vx = Math.abs(state.vx) * 0.28 + 1.2;
    } else {
      state.x -= penetration;
      state.vx = -Math.abs(state.vx) * 0.28 - 1.2;
    }
    const normalEnergy = clearance.side === 'floor' ? Math.abs(previousState.vy) : Math.abs(previousState.vx);
    const amount = impactSeverity(state.speed + normalEnergy * 1.8, clearance.minimum, clearance.zone, { hardness: 0.82 });
    applyDamage({ amount, zone: clearance.zone, reason, source: 'terrain' });
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
      addReward(115, 19, 'СТВОР ПРОЙДЕН', `серия ×${run.combo + 1}`, 'gate');
    } else if (run.combo > 1) {
      run.combo = 1;
      run.comboTime = 0;
    }
  }

  for (const obstacle of nearby.obstacles) {
    const contact = sweptAirframeClearance(previousState, state, obstacle);
    const obstacleDistance = contact.clearance;
    nearestObstacle = Math.min(nearestObstacle, obstacleDistance);
    if (obstacleDistance < 0) {
      const side = contact.x >= obstacle.x ? 1 : -1;
      const soft = obstacle.kind === 'cable';
      state.x += side * Math.max(soft ? 0.16 : 0.34, Math.abs(obstacleDistance) + 0.12);
      state.vx += side * (soft ? 1.4 : 3.1);
      state.y += soft ? 0.06 : 0.16;
      const amount = impactSeverity(state.speed, obstacleDistance, contact.zone, obstacle);
      const reason = obstacle.kind === 'boulder'
        ? 'boulder'
        : obstacle.kind === 'cable'
          ? 'cable'
          : obstacle.kind === 'needle'
            ? 'needle'
            : 'beam';
      if (applyDamage({ amount, zone: contact.zone, reason, source: obstacle.kind }) && phase !== 'running') return null;
    } else if (
      previousState.z <= obstacle.z + 1.3 && state.z >= obstacle.z - 1.3 &&
      obstacleDistance < (obstacle.kind === 'cable' ? 1.15 : 2.2) &&
      !run.grazed.has(obstacle.id)
    ) {
      run.grazed.add(obstacle.id);
      world.markGrazed(obstacle.id);
      run.nearMisses += 1;
      const obstacleLabel = obstacle.kind === 'cable'
        ? 'растяжка'
        : obstacle.kind === 'boulder'
          ? 'валун'
          : obstacle.kind === 'needle'
            ? 'скальная игла'
            : 'каменная кромка';
      addReward(82, 12, 'НА ТОЛЩИНУ БУМАГИ', `${obstacleLabel} · серия ×${run.combo + 1}`);
    }
  }

  const closestWall = clearance.minimum;
  if (closestWall > 0.12 && closestWall < 2.15 && state.speed > 27) {
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
  const targetX = keyboardX || input.x;
  const targetY = keyboardY || input.y;
  const inputResponse = keyboardX || keyboardY ? 9.5 : 12.5;
  const recenterResponse = 15;
  input.controlX = damp(input.controlX, targetX, targetX ? inputResponse : recenterResponse, delta);
  input.controlY = damp(input.controlY, targetY, targetY ? inputResponse : recenterResponse, delta);
  if (Math.abs(input.controlX) < 0.002) input.controlX = 0;
  if (Math.abs(input.controlY) < 0.002) input.controlY = 0;
  elements.stage.style.setProperty('--steer-x', `${input.controlX * 18}px`);
  elements.stage.style.setProperty('--steer-y', `${input.controlY * 13}px`);
  const folded = input.folded || input.keys.has('Space');
  const difficulty = progressDifficulty(state.z);
  const course = courseAt(state.z, run.seed);
  stepFlight(state, {
    x: input.controlX,
    y: input.controlY,
    folded,
    damage: run.damage,
    sensitivity: profile.settings.sensitivity,
    flightAssist: profile.settings.flightAssist,
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
  const segment = world.segmentAt(state.z);
  if (segment.index !== run.segmentZone) {
    if (run.segmentZone >= 0 && segment.setpiece !== 'open') showCallout(segment.setpieceLabel, 'новое препятствие');
    run.segmentZone = segment.index;
  }
  const stalling = state.stall > 0.56;
  if (stalling && !run.wasStalling) {
    showCallout('СВАЛИВАНИЕ', 'опусти нос и верни скорость');
    audio.event('stall');
  }
  run.wasStalling = stalling;
  if (folded && !run.wasFolded) audio.event('fold');
  run.wasFolded = folded;
  run.score += state.speed * delta * 0.72 * comboMultiplier(run.combo) * (flowing ? 2 : 1);
  world.update(state, {
    delta,
    time,
    folded,
    flowing,
    damage: run.damage,
    effects: profile.settings.effects && !reducedMotion.matches,
  });
  updateCamera(state, delta, flowing, folded);
  updateMood(state.z, delta);
  updateHud(folded);
  updateProximity(proximity?.clearance, proximity?.nearestObstacle);
  audio.update(state.speed, folded, flowing, 1 - run.integrity / 100, stalling);

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
    folded: false,
    flowing: false,
    damage: null,
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
    folded: false,
    flowing: false,
    damage: run.damage,
    effects: profile.settings.effects && !reducedMotion.matches,
  });
  updateCamera(run.flight, delta, false, false);
  updateMood(run.flight.z, delta);
  audio.update(0, false, false);
}

function updateCamera(state, delta, flowing, folded, demo = false) {
  const speedPull = clamp((state.speed - 26) / 24, 0, 1);
  const desired = {
    x: state.x - state.vx * 0.045,
    y: state.y + (demo ? 3.45 : 3.05) - state.vy * 0.025,
    z: state.z - 9.25 - speedPull * 2.15,
    tx: state.x + state.vx * 0.11,
    ty: state.y + 0.12 + state.vy * 0.1,
    tz: state.z + 15 + speedPull * 5,
    fov: (flowing ? Math.PI * 0.455 : folded ? Math.PI * 0.41 : Math.PI * 0.37),
    roll: clamp(state.bank * 0.11, -0.075, 0.075),
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

function updateHud(folded) {
  if (!run) return;
  const distance = Math.max(0, Math.floor(run.flight.z));
  const integrity = Math.ceil(run.integrity);
  const flowing = run.flowTime > 0;
  const displayedFlow = flowing ? run.flowTime / FLOW_DURATION * 100 : run.flow;
  elements.distanceValue.textContent = String(distance);
  elements.integrityValue.textContent = String(integrity);
  elements.integrityFill.style.height = `${run.integrity}%`;
  elements.integrityBlock.classList.toggle('is-critical', run.integrity <= 30);
  const damageEntries = [
    [elements.damageLeft, run.damage.leftWing],
    [elements.damageNose, run.damage.nose],
    [elements.damageFold, run.damage.fold],
    [elements.damageRight, run.damage.rightWing],
  ];
  for (const [element, value] of damageEntries) {
    if (!element) continue;
    element.style.setProperty('--health', `${value}%`);
    element.dataset.state = value <= 25 ? 'critical' : value <= 58 ? 'damaged' : 'good';
    element.querySelector('b').textContent = String(Math.ceil(value));
  }
  elements.stallWarning?.classList.toggle('is-visible', run.flight.stall > 0.56);
  elements.scoreValue.textContent = Math.floor(run.score).toString().padStart(6, '0');
  elements.speedValue.textContent = String(Math.round(run.flight.speed * 3.6));
  elements.comboBlock.classList.toggle('is-active', run.combo > 1);
  elements.comboValue.textContent = `×${run.combo}`;
  elements.comboLabel.textContent = flowing ? 'ПРОРЫВ / ДВОЙНОЙ СЧЁТ' : run.combo >= 6 ? 'ОСТРАЯ СЕРИЯ' : 'ЧИСТЫЙ ВОЗДУХ';
  elements.comboTimer.style.transform = `scaleX(${run.combo > 1 ? run.comboTime / COMBO_DURATION : 0})`;
  elements.flowFill.style.width = `${displayedFlow}%`;
  elements.flowValue.textContent = flowing ? String(Math.ceil(run.flowTime)) : String(Math.floor(run.flow));
  elements.flowBlock.classList.toggle('is-ready', flowing || run.flow >= 82);
  elements.stage.classList.toggle('is-boosting', folded && !flowing);
  elements.stage.classList.toggle('is-flowing', flowing);
  elements.diveButton.classList.toggle('is-flow', flowing);
  elements.diveButton.classList.toggle('is-held', folded);
  elements.diveLabel.textContent = flowing ? 'ПРОРЫВ' : folded ? 'СЛОЖЕНО' : 'СЛОЖИТЬ';
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

function virtualStick(point) {
  const dx = point.x - input.startX;
  const dy = point.y - input.startY;
  return virtualStickInput(dx, dy, point.width, point.height);
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
  elements.steerCursor.style.setProperty('--stick-x', '0px');
  elements.steerCursor.style.setProperty('--stick-y', '0px');
  elements.steerCursor.classList.add('is-visible');
});

elements.canvas.addEventListener('pointermove', (event) => {
  if (phase !== 'running' || input.pointerId !== event.pointerId) return;
  event.preventDefault();
  const point = pointerCoordinates(event);
  const stick = virtualStick(point);
  input.x = stick.x;
  input.y = stick.y;
  elements.steerCursor.style.setProperty('--stick-x', `${stick.x * 29}px`);
  elements.steerCursor.style.setProperty('--stick-y', `${stick.y * 29}px`);
});

function endSteering(event) {
  if (input.pointerId !== event.pointerId) return;
  input.pointerId = null;
  input.x = 0;
  input.y = 0;
  elements.steerCursor.style.setProperty('--stick-x', '0px');
  elements.steerCursor.style.setProperty('--stick-y', '0px');
  elements.steerCursor.classList.remove('is-visible');
  try { elements.canvas.releasePointerCapture?.(event.pointerId); } catch { /* capture already gone */ }
}

for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  elements.canvas.addEventListener(type, endSteering);
}

elements.diveButton.addEventListener('pointerdown', (event) => {
  if (phase !== 'running') return;
  event.preventDefault();
  input.folded = true;
  elements.diveButton.classList.add('is-held');
  try { elements.diveButton.setPointerCapture?.(event.pointerId); } catch { /* synthetic or already-lost pointer */ }
});

function endDive(event) {
  input.folded = false;
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
elements.assistSetting.addEventListener('click', () => {
  profile.settings.flightAssist = !profile.settings.flightAssist;
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
  version: '1.2.2',
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
