import { installMobileRuntime, setDocumentScrollLocked } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { RoomScene, ANOMALIES, FINAL_ANOMALY } from './scene.js';
import { HauntAudio } from './audio.js';

installMobileRuntime();
setDocumentScrollLocked(true);

const STORAGE_NAMESPACE = 'pocket-works:zero-frame';
const STORAGE_KEY = `${STORAGE_NAMESPACE}:state`;
const APP_VERSION = '1.0.0';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrapAngle = (value) => {
  const tau = Math.PI * 2;
  let result = value % tau;
  if (result > Math.PI) result -= tau;
  if (result < -Math.PI) result += tau;
  return result;
};

const objectNames = {
  portrait: 'ПОРТРЕТ',
  clock: 'ЧАСЫ',
  mirror: 'ЗЕРКАЛО',
  window: 'ОКНО',
  radio: 'РАДИО',
  chair: 'СТУЛ',
  lamp: 'ЛАМПА',
  door: 'ДВЕРЬ',
  dresser: 'КОМОД',
  basin: 'УМЫВАЛЬНИК'
};

const allAnomalies = new Map([...ANOMALIES, FINAL_ANOMALY].map((item) => [item.id, item]));

const elements = {
  canvas: document.querySelector('#roomCanvas'),
  flash: document.querySelector('#flash'),
  sensorCurtain: document.querySelector('#sensorCurtain'),
  curtainLabel: document.querySelector('#curtainLabel'),
  hud: document.querySelector('#hud'),
  bottomDeck: document.querySelector('#bottomDeck'),
  filmValue: document.querySelector('#filmValue'),
  filmNotches: document.querySelector('#filmNotches'),
  dreadFill: document.querySelector('#dreadFill'),
  dreadValue: document.querySelector('#dreadValue'),
  stageValue: document.querySelector('#stageValue'),
  clueText: document.querySelector('#clueText'),
  focusBrackets: document.querySelector('#focusBrackets'),
  focusReadout: document.querySelector('#focusReadout'),
  toast: document.querySelector('#toast'),
  pauseButton: document.querySelector('#pauseButton'),
  calibrateButton: document.querySelector('#calibrateButton'),
  shutterButton: document.querySelector('#shutterButton'),
  soundButton: document.querySelector('#soundButton'),
  startScreen: document.querySelector('#startScreen'),
  continueButton: document.querySelector('#continueButton'),
  newRunButton: document.querySelector('#newRunButton'),
  startSoundButton: document.querySelector('#startSoundButton'),
  pauseScreen: document.querySelector('#pauseScreen'),
  pauseFilm: document.querySelector('#pauseFilm'),
  pauseMarks: document.querySelector('#pauseMarks'),
  pauseDread: document.querySelector('#pauseDread'),
  resumeButton: document.querySelector('#resumeButton'),
  restartButton: document.querySelector('#restartButton'),
  pauseCalibrateButton: document.querySelector('#pauseCalibrateButton'),
  pauseSoundButton: document.querySelector('#pauseSoundButton'),
  menuButton: document.querySelector('#menuButton'),
  photoStage: document.querySelector('#photoStage'),
  instantPhoto: document.querySelector('#instantPhoto'),
  photoImage: document.querySelector('#photoImage'),
  photoNoise: document.querySelector('#photoNoise'),
  photoBurn: document.querySelector('#photoBurn'),
  photoSerial: document.querySelector('#photoSerial'),
  photoResult: document.querySelector('#photoResult'),
  developTitle: document.querySelector('#developTitle'),
  developHint: document.querySelector('#developHint'),
  developFill: document.querySelector('#developFill'),
  coverButton: document.querySelector('#coverButton'),
  closePhotoButton: document.querySelector('#closePhotoButton'),
  resultScreen: document.querySelector('#resultScreen'),
  resultStamp: document.querySelector('#resultStamp'),
  resultEyebrow: document.querySelector('#resultEyebrow'),
  resultTitle: document.querySelector('#resultTitle'),
  resultCopy: document.querySelector('#resultCopy'),
  resultMarks: document.querySelector('#resultMarks'),
  resultWrong: document.querySelector('#resultWrong'),
  resultTime: document.querySelector('#resultTime'),
  resultEscapes: document.querySelector('#resultEscapes'),
  resultRestartButton: document.querySelector('#resultRestartButton')
};

function defaultPersistentState() {
  return {
    version: 1,
    sound: true,
    stats: { escapes: 0, deaths: 0, bestTime: null },
    activeRun: null
  };
}

function loadPersistentState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed || parsed.version !== 1) return defaultPersistentState();
    const stats = parsed.stats && typeof parsed.stats === 'object' ? parsed.stats : {};
    return {
      version: 1,
      sound: parsed.sound !== false,
      stats: {
        escapes: Number.isInteger(stats.escapes) ? Math.max(0, stats.escapes) : 0,
        deaths: Number.isInteger(stats.deaths) ? Math.max(0, stats.deaths) : 0,
        bestTime: Number.isFinite(stats.bestTime) ? Math.max(0, stats.bestTime) : null
      },
      activeRun: validateRun(parsed.activeRun) ? parsed.activeRun : null
    };
  } catch {
    return defaultPersistentState();
  }
}

function validateRun(value) {
  return Boolean(value)
    && Array.isArray(value.sequence)
    && value.sequence.length === 5
    && value.sequence.every((id) => allAnomalies.has(id))
    && Number.isInteger(value.stage)
    && value.stage >= 0
    && value.stage < value.sequence.length
    && Number.isInteger(value.film)
    && value.film >= 0
    && value.film <= 7
    && Number.isFinite(value.threat)
    && Array.isArray(value.captured)
    && Number.isFinite(value.elapsed)
    && Number.isFinite(value.yaw)
    && Number.isFinite(value.pitch);
}

let persistent = loadPersistentState();
const audio = new HauntAudio(persistent.sound);
const scene = new RoomScene(elements.canvas);

let mode = 'menu';
let run = null;
let photo = null;
let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let lastFrame = performance.now();
let rafId = 0;
let toastTimer = 0;
let shutterCooldown = 0;
let focusLocked = false;
let focusSoundArmed = true;
let coverHeld = false;
let pointer = null;
let sensorRequested = false;
let orientationLive = false;
let motionLive = false;
let baseline = null;
let latestOrientation = null;
let tilt = { x: 0, y: 0 };
let targetTilt = { x: 0, y: 0 };
let gravitySign = 0;
let rawFaceDown = false;
let faceDown = false;
let faceDownChangedAt = 0;
let keyboard = new Set();
let lastAutosaveAt = 0;
let demoYaw = -0.7;

scene.setReducedMotion(reducedMotion);

function savePersistentState() {
  if (run && ['playing', 'paused', 'developing', 'photo'].includes(mode)) {
    persistent.activeRun = serializeRun(run);
  } else if (!run || ['won', 'lost', 'menu'].includes(mode)) {
    if (mode === 'menu' && run) persistent.activeRun = serializeRun(run);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistent));
  } catch (error) {
    console.warn('Zero Frame storage failed', error);
  }
}

function serializeRun(value) {
  return {
    seed: value.seed >>> 0,
    sequence: [...value.sequence],
    stage: value.stage,
    film: value.film,
    threat: Number(value.threat.toFixed(2)),
    wrong: value.wrong,
    elapsed: Number(value.elapsed.toFixed(2)),
    captured: [...value.captured],
    yaw: Number(value.yaw.toFixed(4)),
    pitch: Number(value.pitch.toFixed(4)),
    mutation: value.mutation,
    finalDoorOpen: Boolean(value.finalDoorOpen)
  };
}

function randomSeed() {
  const data = new Uint32Array(1);
  crypto.getRandomValues(data);
  return data[0] || Date.now();
}

function seededShuffle(items, seed) {
  let value = seed >>> 0 || 1;
  const random = () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function createRun(seed = randomSeed()) {
  const sequence = seededShuffle(ANOMALIES.map((item) => item.id), seed).slice(0, 4);
  sequence.push(FINAL_ANOMALY.id);
  return {
    seed,
    sequence,
    stage: 0,
    film: 7,
    threat: 8,
    wrong: 0,
    elapsed: 0,
    captured: [],
    yaw: -0.92,
    pitch: 0,
    mutation: 0,
    finalDoorOpen: false
  };
}

function restoreRun(serialized) {
  return {
    seed: serialized.seed >>> 0 || randomSeed(),
    sequence: [...serialized.sequence],
    stage: serialized.stage,
    film: serialized.film,
    threat: serialized.threat,
    wrong: Number.isInteger(serialized.wrong) ? serialized.wrong : 0,
    elapsed: serialized.elapsed,
    captured: [...serialized.captured],
    yaw: serialized.yaw,
    pitch: serialized.pitch,
    mutation: Number.isInteger(serialized.mutation) ? serialized.mutation : 0,
    finalDoorOpen: Boolean(serialized.finalDoorOpen)
  };
}

function currentAnomaly() {
  if (!run) return ANOMALIES[0];
  return allAnomalies.get(run.sequence[run.stage]) || ANOMALIES[0];
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function showToast(message, duration = 1900) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => elements.toast.classList.remove('is-visible'), duration);
}

function setOverlay(element, visible) {
  element.classList.toggle('is-visible', visible);
  element.setAttribute('aria-hidden', String(!visible));
}

function setMode(nextMode) {
  mode = nextMode;
  const menu = nextMode === 'menu';
  const paused = nextMode === 'paused';
  const result = nextMode === 'won' || nextMode === 'lost';
  const inPhoto = nextMode === 'developing' || nextMode === 'photo';
  setOverlay(elements.startScreen, menu);
  setOverlay(elements.pauseScreen, paused);
  setOverlay(elements.resultScreen, result);
  setOverlay(elements.photoStage, inPhoto);
  const controlsVisible = ['playing', 'paused'].includes(nextMode);
  elements.hud.hidden = !controlsVisible;
  elements.bottomDeck.hidden = !controlsVisible;
  elements.pauseButton.disabled = nextMode !== 'playing';
  elements.shutterButton.disabled = nextMode !== 'playing';
  if (!inPhoto) setCoveredVisual(false);
}

function updateSoundButtons() {
  const label = audio.enabled ? 'ВКЛ' : 'ВЫКЛ';
  elements.startSoundButton.textContent = `ЗВУК: ${label}`;
  elements.pauseSoundButton.textContent = `ЗВУК: ${label}`;
  elements.soundButton.textContent = audio.enabled ? 'ЗВУК' : 'ТИХО';
  for (const button of [elements.startSoundButton, elements.pauseSoundButton, elements.soundButton]) {
    button.setAttribute('aria-pressed', String(audio.enabled));
  }
}

function updateMenu() {
  const canResume = validateRun(persistent.activeRun);
  elements.continueButton.textContent = canResume ? 'ПРОДОЛЖИТЬ ПЛЁНКУ' : 'ВЗЯТЬ КАМЕРУ';
  elements.newRunButton.textContent = canResume ? 'СЖЕЧЬ СТАРУЮ · НОВАЯ ПЛЁНКА' : 'НОВАЯ ПЛЁНКА';
}

function buildFilmNotches() {
  elements.filmNotches.replaceChildren();
  for (let i = 0; i < 7; i += 1) {
    const notch = document.createElement('i');
    elements.filmNotches.append(notch);
  }
}

function updateHud(focus = null) {
  if (!run) return;
  const anomaly = currentAnomaly();
  elements.filmValue.value = String(run.film).padStart(2, '0');
  [...elements.filmNotches.children].forEach((notch, index) => {
    notch.classList.toggle('is-empty', index >= run.film);
  });
  const threat = clamp(run.threat, 0, 100);
  elements.dreadFill.style.height = `${Math.max(3, threat)}%`;
  elements.dreadValue.value = String(Math.round(threat)).padStart(2, '0');
  elements.stageValue.textContent = `КАДР ${String(run.stage + 1).padStart(2, '0')} / 05`;
  elements.clueText.textContent = anomaly.clue;
  const quality = focus?.quality || 0;
  elements.focusReadout.style.setProperty('--focus', clamp(quality, .08, 1).toFixed(3));
  elements.focusReadout.querySelector('span').textContent = quality > .72 ? 'ФОКУС' : quality > .35 ? 'БЛИЗКО' : 'ИЩИ';
  elements.focusReadout.classList.toggle('is-lock', quality > .72);
  elements.focusBrackets.classList.toggle('is-focused', quality > .52);
  const perfect = focus?.id === anomaly.id && quality > .72;
  elements.focusBrackets.classList.toggle('is-perfect', perfect);
  elements.shutterButton.classList.toggle('is-ready', quality > .5);
  if (perfect && !focusLocked && focusSoundArmed) {
    audio.focus();
    focusLocked = true;
    focusSoundArmed = false;
    window.setTimeout(() => { focusSoundArmed = true; }, 460);
  }
  if (!perfect) focusLocked = false;
}

function updatePauseStats() {
  if (!run) return;
  elements.pauseFilm.textContent = String(run.film).padStart(2, '0');
  elements.pauseMarks.textContent = String(run.captured.length).padStart(2, '0');
  elements.pauseDread.textContent = String(Math.round(run.threat)).padStart(2, '0');
}

function mapOrientation(beta, gamma) {
  const rawAngle = Number(screen.orientation?.angle ?? window.orientation ?? 0);
  const angle = ((rawAngle % 360) + 360) % 360;
  if (angle === 90) return { x: beta, y: -gamma };
  if (angle === 270) return { x: -beta, y: gamma };
  if (angle === 180) return { x: -gamma, y: -beta };
  return { x: gamma, y: beta };
}

function calibrate(showMessage = true) {
  if (latestOrientation) {
    baseline = mapOrientation(latestOrientation.beta, latestOrientation.gamma);
    targetTilt.x = 0;
    targetTilt.y = 0;
    tilt.x = 0;
    tilt.y = 0;
    if (showMessage) showToast('ЭТО ПОЛОЖЕНИЕ ПРИНЯТО ЗА НОЛЬ');
  } else if (showMessage) {
    showToast('НАКЛОН НЕ АКТИВЕН · ВЕДИ КАМЕРУ ПАЛЬЦЕМ');
  }
  audio.click();
}

async function requestPermission(Constructor) {
  if (typeof Constructor?.requestPermission !== 'function') return 'granted';
  try {
    return await Constructor.requestPermission();
  } catch {
    return 'denied';
  }
}

async function requestSensors() {
  if (sensorRequested) return orientationLive || motionLive;
  sensorRequested = true;
  const orientationPermission = await requestPermission(window.DeviceOrientationEvent);
  const motionPermission = await requestPermission(window.DeviceMotionEvent);

  if (orientationPermission === 'granted' && 'DeviceOrientationEvent' in window) {
    window.addEventListener('deviceorientation', handleOrientation, { passive: true });
  }
  if (motionPermission === 'granted' && 'DeviceMotionEvent' in window) {
    window.addEventListener('devicemotion', handleMotion, { passive: true });
  }

  await new Promise((resolve) => window.setTimeout(resolve, 520));
  if (orientationLive) calibrate(false);
  return orientationLive || motionLive;
}

function handleOrientation(event) {
  if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
  latestOrientation = { beta: event.beta, gamma: event.gamma };
  orientationLive = true;
  if (!baseline) calibrate(false);
  const mapped = mapOrientation(event.beta, event.gamma);
  targetTilt.x = clamp((mapped.x - baseline.x) / 18, -1.1, 1.1);
  targetTilt.y = clamp((mapped.y - baseline.y) / 16, -1, 1);
}

function handleMotion(event) {
  const z = Number(event.accelerationIncludingGravity?.z);
  if (!Number.isFinite(z) || Math.abs(z) < 1.5) return;
  motionLive = true;
  if (!gravitySign && Math.abs(z) > 6) gravitySign = Math.sign(z);
  if (!gravitySign) return;
  const nextRaw = Math.sign(z) !== gravitySign && Math.abs(z) > 5.4;
  if (nextRaw !== rawFaceDown) {
    rawFaceDown = nextRaw;
    faceDownChangedAt = performance.now();
  }
}

function updateFaceDown(now) {
  if (rawFaceDown !== faceDown && now - faceDownChangedAt > 145) {
    faceDown = rawFaceDown;
  }
}

async function prepareExperience() {
  await audio.unlock();
  const sensors = await requestSensors();
  if (orientationLive && motionLive) showToast('НАКЛОН И ПЕРЕВОРОТ АКТИВНЫ');
  else if (orientationLive) showToast('НАКЛОН АКТИВЕН · ПРОЯВЛЯЙ КНОПКОЙ');
  else if (motionLive) showToast('ПЕРЕВОРОТ АКТИВЕН · ВЕДИ ПАЛЬЦЕМ');
  else showToast('СЕНСОРЫ НЕДОСТУПНЫ · ПОЛНЫЙ ПАЛЬЦЕВОЙ РЕЖИМ');
  return sensors;
}

async function beginRun({ resume = false } = {}) {
  await prepareExperience();
  if (resume && validateRun(persistent.activeRun)) run = restoreRun(persistent.activeRun);
  else run = createRun();
  scene.setSeed(run.seed);
  photo = null;
  persistent.activeRun = serializeRun(run);
  savePersistentState();
  setMode('playing');
  updateHud(scene.getVisibleObject(run.yaw, run.pitch));
  audio.setThreat(run.threat);
  audio.click();
}

function pauseGame() {
  if (mode !== 'playing') return;
  updatePauseStats();
  setMode('paused');
  savePersistentState();
  audio.click();
}

function resumeGame() {
  if (mode !== 'paused') return;
  setMode('playing');
  audio.click();
}

function returnToMenu() {
  if (run) persistent.activeRun = serializeRun(run);
  savePersistentState();
  setMode('menu');
  updateMenu();
  audio.click();
}

async function restartRun() {
  persistent.activeRun = null;
  run = createRun();
  scene.setSeed(run.seed);
  savePersistentState();
  await prepareExperience();
  setMode('playing');
  audio.click();
}

function takePhoto() {
  if (mode !== 'playing' || !run || shutterCooldown > 0 || run.film <= 0) return;
  shutterCooldown = .55;
  const focus = scene.getVisibleObject(run.yaw, run.pitch);
  const anomaly = currentAnomaly();
  const correct = Boolean(focus && focus.id === anomaly.id && focus.quality > .68);
  const focusedId = focus?.id || null;
  const image = scene.captureDataUrl();
  run.film -= 1;
  photo = {
    image,
    correct,
    focusedId,
    anomaly,
    stage: run.stage,
    progress: 0,
    ready: false,
    revealed: false,
    mutationApplied: false,
    stepIndex: 0,
    pendingOutcome: null
  };
  elements.photoImage.src = image;
  elements.photoSerial.textContent = `FRAME ${String(run.stage + 1).padStart(2, '0')} · ${String(run.film).padStart(2, '0')} LEFT`;
  elements.photoResult.textContent = 'ЭМУЛЬСИЯ ЧЁРНАЯ';
  elements.developTitle.textContent = 'ПЕРЕВЕРНИ ТЕЛЕФОН ЭКРАНОМ ВНИЗ';
  elements.developHint.textContent = motionLive ? 'держи экран вниз, пока шкала не заполнится' : 'сенсор недоступен — удерживай кнопку ниже';
  elements.developFill.style.width = '0%';
  elements.instantPhoto.classList.remove('is-developed');
  elements.closePhotoButton.classList.remove('is-visible');
  elements.coverButton.hidden = false;
  elements.coverButton.classList.remove('is-held');
  elements.photoBurn.textContent = '';
  elements.photoBurn.className = 'photo-burn';
  drawPhotoNoise(run.seed ^ (run.stage + 1) * 9187 ^ run.film * 71);
  setMode('developing');
  triggerFlash();
  audio.shutter();
  audio.eject();
  navigator.vibrate?.([10, 18, 8]);
  savePersistentState();
}

function triggerFlash() {
  elements.flash.classList.remove('is-active');
  void elements.flash.offsetWidth;
  elements.flash.classList.add('is-active');
}

function drawPhotoNoise(seed) {
  const canvas = elements.photoNoise;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  let value = seed >>> 0 || 1;
  const random = () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
  for (let i = 0; i < 380; i += 1) {
    const alpha = .02 + random() * .12;
    ctx.fillStyle = `rgba(27,22,16,${alpha})`;
    const size = random() > .94 ? 2 : .7;
    ctx.fillRect(random() * rect.width, random() * rect.height, size, size);
  }
  ctx.strokeStyle = 'rgba(30,24,17,.24)';
  for (let i = 0; i < 9; i += 1) {
    const x = random() * rect.width;
    ctx.beginPath();
    ctx.moveTo(x, random() * rect.height * .3);
    ctx.lineTo(x + random() * 7 - 3.5, rect.height * (.55 + random() * .45));
    ctx.stroke();
  }
}

function setCoveredVisual(value) {
  const visible = Boolean(value && mode === 'developing');
  elements.sensorCurtain.classList.toggle('is-visible', visible);
  elements.sensorCurtain.setAttribute('aria-hidden', String(!visible));
}

function applyHiddenMutation() {
  if (!run || !photo || photo.mutationApplied) return;
  photo.mutationApplied = true;
  run.mutation += 1;
  if (photo.correct) run.threat = clamp(run.threat + 1.5, 0, 100);
  else run.threat = clamp(run.threat + 4.5, 0, 100);
  audio.setThreat(run.threat);
}

function revealPhoto() {
  if (!photo || photo.revealed) return;
  photo.revealed = true;
  mode = 'photo';
  setCoveredVisual(false);
  elements.instantPhoto.classList.add('is-developed');
  elements.developFill.style.width = '100%';
  elements.developTitle.textContent = 'СНИМОК ПРОЯВЛЕН';
  elements.developHint.textContent = 'проверь, что камера увидела вместо тебя';
  elements.coverButton.hidden = true;
  elements.closePhotoButton.classList.add('is-visible');

  if (photo.correct) {
    const final = photo.anomaly.id === FINAL_ANOMALY.id;
    elements.photoResult.textContent = photo.anomaly.success;
    elements.photoBurn.textContent = final ? 'EXIT' : '0';
    elements.photoBurn.classList.add('is-correct');
    if (!run.captured.includes(photo.anomaly.id)) run.captured.push(photo.anomaly.id);
    run.threat = clamp(run.threat - (final ? 12 : 7), 0, 100);
    if (final) {
      photo.pendingOutcome = 'won';
    } else {
      run.stage += 1;
      if (run.sequence[run.stage] === FINAL_ANOMALY.id) run.finalDoorOpen = true;
    }
    audio.success();
    audio.whisper(true);
    navigator.vibrate?.([14, 42, 18]);
  } else {
    run.wrong += 1;
    run.threat = clamp(run.threat + 22, 0, 100);
    const wrongName = photo.focusedId ? objectNames[photo.focusedId] || 'НЕЧТО' : 'ПУСТОТА';
    elements.photoResult.textContent = `${wrongName} · НЕ ЭТО`;
    elements.photoBurn.textContent = run.threat > 68 ? 'ЗА ТОБОЙ' : 'НЕ ЭТО';
    elements.photoBurn.classList.add('is-wrong');
    audio.failure();
    audio.whisper(false);
    navigator.vibrate?.([30, 35, 30]);
    if (run.threat >= 100 || run.film <= 0) photo.pendingOutcome = 'lost';
  }
  audio.setThreat(run.threat);
  savePersistentState();
}

function closePhoto() {
  if (!photo?.revealed) return;
  shutterCooldown = 0;
  const outcome = photo.pendingOutcome;
  photo = null;
  setOverlay(elements.photoStage, false);
  if (outcome === 'won') {
    finishRun(true);
    return;
  }
  if (outcome === 'lost' || run.threat >= 100 || run.film <= 0) {
    finishRun(false);
    return;
  }
  setMode('playing');
  updateHud(scene.getVisibleObject(run.yaw, run.pitch));
}

function finishRun(won) {
  if (!run) return;
  const finalRun = run;
  persistent.activeRun = null;
  if (won) {
    persistent.stats.escapes += 1;
    if (!Number.isFinite(persistent.stats.bestTime) || finalRun.elapsed < persistent.stats.bestTime) {
      persistent.stats.bestTime = Number(finalRun.elapsed.toFixed(2));
    }
  } else persistent.stats.deaths += 1;
  setMode(won ? 'won' : 'lost');
  elements.resultStamp.textContent = won ? 'DEVELOPED' : 'NEGATIVE';
  elements.resultStamp.style.borderColor = won ? '#56614c' : '#7c392f';
  elements.resultStamp.style.color = won ? '#56614c' : '#7c392f';
  elements.resultEyebrow.textContent = won ? 'ПЯТЫЙ КАДР БЫЛ ДВЕРЬЮ' : finalRun.film <= 0 ? 'ПЛЁНКА ЗАКОНЧИЛАСЬ' : 'КОМНАТА ПЕРЕПОЛНИЛАСЬ';
  elements.resultTitle.textContent = won ? 'ТЫ ВЫШЕЛ ИЗ НУЛЕВОГО КАДРА' : 'ТЫ ОСТАЛСЯ В КОМНАТЕ';
  elements.resultCopy.textContent = won
    ? 'На последнем снимке дверь была открыта наружу. На стене за ней висела фотография того, как ты держишь телефон сейчас.'
    : 'Последний снимок проявился уже без тебя. В углу кадра осталось свободное место — ровно твоего роста.';
  elements.resultMarks.textContent = `${finalRun.captured.length} / 5`;
  elements.resultWrong.textContent = String(finalRun.wrong);
  elements.resultTime.textContent = formatTime(finalRun.elapsed);
  elements.resultEscapes.textContent = String(persistent.stats.escapes);
  if (won) audio.win();
  else audio.lose();
  navigator.vibrate?.(won ? [22, 40, 22, 80, 30] : [80, 40, 120]);
  run = null;
  savePersistentState();
  updateMenu();
}

function updateDeveloping(delta, now) {
  if (!photo || !run) return;
  const covered = faceDown || coverHeld;
  setCoveredVisual(covered);
  elements.curtainLabel.textContent = photo.ready ? 'ПОДНИМИ ТЕЛЕФОН' : 'НЕ СМОТРИ';
  if (!photo.ready && covered) {
    photo.progress = clamp(photo.progress + delta / 2.45, 0, 1);
    elements.developFill.style.width = `${Math.round(photo.progress * 100)}%`;
    const thresholds = [.2, .47, .74, .92];
    while (photo.stepIndex < thresholds.length && photo.progress >= thresholds[photo.stepIndex]) {
      audio.developmentStep(photo.stepIndex);
      navigator.vibrate?.(photo.stepIndex === 2 ? 13 : 6);
      photo.stepIndex += 1;
    }
    if (photo.progress >= .5) applyHiddenMutation();
    if (photo.progress >= 1) {
      photo.ready = true;
      elements.developTitle.textContent = 'ПЛЁНКА ПРОЯВИЛАСЬ · ПОДНИМИ ТЕЛЕФОН';
      elements.developHint.textContent = 'не держи камеру закрытой дольше, чем нужно';
      audio.whisper(photo.correct);
    }
  }
  if (photo.ready && !covered) revealPhoto();
  if (now - lastAutosaveAt > 900) {
    lastAutosaveAt = now;
    savePersistentState();
  }
}

function updatePlaying(delta, now) {
  if (!run) return;
  shutterCooldown = Math.max(0, shutterCooldown - delta);
  tilt.x += (targetTilt.x - tilt.x) * clamp(delta * 8, 0, 1);
  tilt.y += (targetTilt.y - tilt.y) * clamp(delta * 8, 0, 1);
  const keyboardX = (keyboard.has('ArrowRight') || keyboard.has('KeyD') ? 1 : 0) - (keyboard.has('ArrowLeft') || keyboard.has('KeyA') ? 1 : 0);
  const keyboardY = (keyboard.has('ArrowDown') || keyboard.has('KeyS') ? 1 : 0) - (keyboard.has('ArrowUp') || keyboard.has('KeyW') ? 1 : 0);
  if (orientationLive) {
    run.yaw = wrapAngle(run.yaw + tilt.x * delta * .86);
    const sensorPitch = clamp(-tilt.y * .38, -.42, .42);
    run.pitch += (sensorPitch - run.pitch) * clamp(delta * 4.4, 0, 1);
  }
  if (keyboardX || keyboardY) {
    run.yaw = wrapAngle(run.yaw + keyboardX * delta * 1.28);
    run.pitch = clamp(run.pitch + keyboardY * delta * .62, -.45, .45);
  }
  run.elapsed += delta;
  run.threat = clamp(run.threat + delta * (.115 + run.stage * .018 + run.wrong * .015), 0, 100);
  if (run.threat >= 100) {
    finishRun(false);
    return;
  }
  const focus = scene.getVisibleObject(run.yaw, run.pitch);
  updateHud(focus);
  audio.setThreat(run.threat);
  if (now - lastAutosaveAt > 1300) {
    lastAutosaveAt = now;
    savePersistentState();
  }
}

function render(now) {
  const active = run || {
    seed: 1,
    sequence: [ANOMALIES[0].id],
    stage: 0,
    film: 7,
    threat: 18,
    wrong: 0,
    elapsed: 0,
    captured: [],
    yaw: demoYaw,
    pitch: .02,
    mutation: 0,
    finalDoorOpen: false
  };
  const anomaly = run ? currentAnomaly() : ANOMALIES[0];
  scene.render({
    yaw: active.yaw,
    pitch: active.pitch,
    roll: orientationLive ? tilt.x * .045 : 0,
    threat: active.threat,
    activeTarget: anomaly.id,
    captured: active.captured,
    anomalyLevel: 1,
    mutation: active.mutation,
    finalDoorOpen: active.finalDoorOpen,
    entityHidden: mode === 'menu' || mode === 'won',
    time: now
  });
}

function frame(now) {
  const delta = clamp((now - lastFrame) / 1000, 0, .05);
  lastFrame = now;
  updateFaceDown(now);
  if (mode === 'playing') updatePlaying(delta, now);
  else if (mode === 'developing') updateDeveloping(delta, now);
  else if (mode === 'menu' && !reducedMotion) demoYaw = wrapAngle(demoYaw + delta * .06);
  render(now);
  rafId = requestAnimationFrame(frame);
}

function pointerPoint(event) {
  return { x: event.clientX, y: event.clientY };
}

function beginPointer(event) {
  if (mode !== 'playing' || orientationLive) return;
  const point = pointerPoint(event);
  pointer = { id: event.pointerId, x: point.x, y: point.y, moved: false };
  try { elements.canvas.setPointerCapture(event.pointerId); } catch {}
  event.preventDefault();
}

function movePointer(event) {
  if (!pointer || pointer.id !== event.pointerId || mode !== 'playing' || !run) return;
  const point = pointerPoint(event);
  const dx = point.x - pointer.x;
  const dy = point.y - pointer.y;
  if (Math.hypot(dx, dy) > 1.5) pointer.moved = true;
  run.yaw = wrapAngle(run.yaw - dx * .0062);
  run.pitch = clamp(run.pitch + dy * .0047, -.45, .45);
  pointer.x = point.x;
  pointer.y = point.y;
  event.preventDefault();
}

function endPointer(event) {
  if (!pointer || pointer.id !== event.pointerId) return;
  try { elements.canvas.releasePointerCapture(event.pointerId); } catch {}
  pointer = null;
}

function beginCover(event) {
  if (mode !== 'developing' || photo?.ready) return;
  coverHeld = true;
  elements.coverButton.classList.add('is-held');
  try { elements.coverButton.setPointerCapture?.(event.pointerId); } catch {}
  event.preventDefault();
}

function endCover(event) {
  coverHeld = false;
  elements.coverButton.classList.remove('is-held');
  try { elements.coverButton.releasePointerCapture?.(event.pointerId); } catch {}
}

async function toggleSound() {
  const enabled = !audio.enabled;
  audio.setEnabled(enabled);
  persistent.sound = enabled;
  savePersistentState();
  updateSoundButtons();
  if (enabled) {
    await audio.unlock();
    audio.click();
  }
}

elements.continueButton.addEventListener('click', () => beginRun({ resume: validateRun(persistent.activeRun) }));
elements.newRunButton.addEventListener('click', () => {
  persistent.activeRun = null;
  savePersistentState();
  beginRun({ resume: false });
});
elements.startSoundButton.addEventListener('click', toggleSound);
elements.soundButton.addEventListener('click', toggleSound);
elements.pauseSoundButton.addEventListener('click', toggleSound);
elements.pauseButton.addEventListener('click', pauseGame);
elements.resumeButton.addEventListener('click', resumeGame);
elements.restartButton.addEventListener('click', restartRun);
elements.resultRestartButton.addEventListener('click', restartRun);
elements.menuButton.addEventListener('click', returnToMenu);
elements.calibrateButton.addEventListener('click', () => calibrate(true));
elements.pauseCalibrateButton.addEventListener('click', () => calibrate(true));
elements.shutterButton.addEventListener('click', takePhoto);
elements.closePhotoButton.addEventListener('click', closePhoto);

elements.canvas.addEventListener('pointerdown', beginPointer);
elements.canvas.addEventListener('pointermove', movePointer);
elements.canvas.addEventListener('pointerup', endPointer);
elements.canvas.addEventListener('pointercancel', endPointer);
elements.canvas.addEventListener('lostpointercapture', endPointer);

elements.coverButton.addEventListener('pointerdown', beginCover);
elements.coverButton.addEventListener('pointerup', endCover);
elements.coverButton.addEventListener('pointercancel', endCover);
elements.coverButton.addEventListener('lostpointercapture', endCover);

window.addEventListener('keydown', (event) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
    keyboard.add(event.code);
    event.preventDefault();
  }
  if (event.code === 'Space' && mode === 'playing') {
    takePhoto();
    event.preventDefault();
  }
  if (event.code === 'Escape') {
    if (mode === 'playing') pauseGame();
    else if (mode === 'paused') resumeGame();
  }
});
window.addEventListener('keyup', (event) => keyboard.delete(event.code));
window.addEventListener('blur', () => keyboard.clear());
window.addEventListener('resize', () => scene.resize());
window.addEventListener('orientationchange', () => {
  window.setTimeout(() => {
    scene.resize();
    if (orientationLive) calibrate(false);
  }, 260);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (mode === 'playing') pauseGame();
    audio.suspend();
    savePersistentState();
  } else audio.resume();
});
window.addEventListener('pagehide', savePersistentState);

matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (event) => {
  reducedMotion = event.matches;
  scene.setReducedMotion(reducedMotion);
});

createWorkshopMode({
  appName: 'НУЛЕВОЙ КАДР',
  version: APP_VERSION,
  cachePrefix: 'zero-frame-',
  storageNamespace: STORAGE_NAMESPACE,
  onReset: async () => location.reload()
});

buildFilmNotches();
updateSoundButtons();
updateMenu();
elements.hud.hidden = true;
elements.bottomDeck.hidden = true;
elements.pauseButton.disabled = true;
setMode('menu');
rafId = requestAnimationFrame(frame);

window.addEventListener('beforeunload', () => cancelAnimationFrame(rafId));
