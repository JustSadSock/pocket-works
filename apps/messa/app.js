import { installMobileRuntime, setDocumentScrollLocked } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  OUTER_RADIUS,
  REWIND_COST,
  VOICE_COUNT,
  awardNearMiss,
  awardVoice,
  canCollectVoice,
  clamp,
  collisionFor,
  createWorld,
  distance2,
  freshRun,
  length2,
  obstaclePosition,
  proximityFor,
  restoreSnapshot,
  routeCode,
  sanitizeRun,
  serializeRun,
  snapshot,
  stepOrbit,
  targetPosition
} from './game-core.js';
import { MessaEngine } from './engine.js';
import { OrbitAudio } from './audio.js';

installMobileRuntime();
setDocumentScrollLocked(true);

const APP_VERSION = '1.0.0';
const STORAGE_NAMESPACE = 'pocket-works:messa';
const STORAGE_KEY = `${STORAGE_NAMESPACE}:profile`;
const byId = (id) => document.getElementById(id);
const elements = {
  world: byId('world'),
  canvas: byId('worldCanvas'),
  gravityMarker: byId('gravityMarker'),
  impactFlash: byId('impactFlash'),
  awakening: byId('awakening'),
  loading: byId('loading'),
  loadingText: byId('loadingText'),
  fatal: byId('fatal'),
  fatalText: byId('fatalText'),
  reloadButton: byId('reloadButton'),
  flightHeader: byId('flightHeader'),
  pauseButton: byId('pauseButton'),
  voiceValue: byId('voiceValue'),
  hud: byId('hud'),
  stabilityMarks: [...byId('stabilityMarks').querySelectorAll('i')],
  scoreValue: byId('scoreValue'),
  velocityValue: byId('velocityValue'),
  targetCopy: byId('targetCopy'),
  targetDistance: byId('targetDistance'),
  eventCallout: byId('eventCallout'),
  rewindButton: byId('rewindButton'),
  rewindFill: byId('rewindFill'),
  rewindLabel: byId('rewindLabel'),
  menu: byId('menuOverlay'),
  bestScore: byId('bestScore'),
  bestVoices: byId('bestVoices'),
  winsValue: byId('winsValue'),
  startButton: byId('startButton'),
  resumeButton: byId('resumeButton'),
  resumeMeta: byId('resumeMeta'),
  howButton: byId('howButton'),
  soundButton: byId('soundButton'),
  briefing: byId('briefingOverlay'),
  briefingClose: byId('briefingClose'),
  briefingStart: byId('briefingStart'),
  pauseOverlay: byId('pauseOverlay'),
  pauseVoices: byId('pauseVoices'),
  pauseScore: byId('pauseScore'),
  pauseStability: byId('pauseStability'),
  continueButton: byId('continueButton'),
  restartButton: byId('restartButton'),
  pauseSoundButton: byId('pauseSoundButton'),
  menuButton: byId('menuButton'),
  resultOverlay: byId('resultOverlay'),
  resultKicker: byId('resultKicker'),
  resultTitle: byId('resultTitle'),
  resultScore: byId('resultScore'),
  resultVoices: byId('resultVoices'),
  resultNear: byId('resultNear'),
  resultTime: byId('resultTime'),
  resultNote: byId('resultNote'),
  recordBadge: byId('recordBadge'),
  againButton: byId('againButton'),
  resultMenuButton: byId('resultMenuButton')
};

function freshProfile() {
  return {
    version: 1,
    sound: true,
    haptics: true,
    tutorialSeen: false,
    bestScore: 0,
    bestVoices: 0,
    wins: 0,
    attempts: 0,
    savedRun: null
  };
}

function loadProfile() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!value || value.version !== 1) return freshProfile();
    return {
      version: 1,
      sound: value.sound !== false,
      haptics: value.haptics !== false,
      tutorialSeen: Boolean(value.tutorialSeen),
      bestScore: Math.max(0, Number(value.bestScore) || 0),
      bestVoices: Math.floor(clamp(Number(value.bestVoices) || 0, 0, VOICE_COUNT)),
      wins: Math.max(0, Math.floor(Number(value.wins) || 0)),
      attempts: Math.max(0, Math.floor(Number(value.attempts) || 0)),
      savedRun: sanitizeRun(value.savedRun)
    };
  } catch {
    return freshProfile();
  }
}

let profile = loadProfile();

function saveProfile() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); }
  catch (error) { console.warn('МЕССА не смогла записать орбиту', error); }
}

const audio = new OrbitAudio(profile.sound);
let engine = null;
let mode = 'loading';
let run = null;
let world = null;
let pendingSeed = null;
let frameHandle = 0;
let previousFrame = performance.now();
let lastSavedAt = 0;
let history = [];
let rewinding = false;
let rewindFrames = [];
let rewindIndex = 0;
let particles = [];
let nearArmed = new Map();
let crashTimeout = 0;
let calloutTimeout = 0;
let demoTime = 0;
let demoTrail = [];
const demoWorld = createWorld(0x4d455353);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const well = { active: false, x: 5, z: 4, power: 0, pointerId: null };
let cursorWorld = { x: 5, z: 4 };
const keys = new Set();

const workshop = createWorkshopMode({
  appName: 'МЕССА',
  version: APP_VERSION,
  cachePrefix: 'messa-',
  storageNamespace: STORAGE_NAMESPACE,
  onReset() {
    profile = freshProfile();
    saveProfile();
    location.reload();
  }
});

function randomSeed() {
  if (globalThis.crypto?.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
  return (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
}

function setHidden(element, hidden) {
  if (element) element.hidden = hidden;
}

function haptic(pattern) {
  if (profile.haptics && navigator.vibrate) navigator.vibrate(pattern);
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function formatScore(value) {
  return Math.floor(value).toLocaleString('ru-RU');
}

function pulse(element, className = 'is-active') {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function callout(title, subtitle = '') {
  clearTimeout(calloutTimeout);
  elements.eventCallout.querySelector('b').textContent = title;
  elements.eventCallout.querySelector('span').textContent = subtitle;
  pulse(elements.eventCallout);
  calloutTimeout = setTimeout(() => elements.eventCallout.classList.remove('is-active'), 1300);
}

function syncSoundButtons() {
  const label = profile.sound ? 'ВКЛ' : 'ВЫКЛ';
  elements.soundButton.textContent = `ЗВУК: ${label}`;
  elements.pauseSoundButton.textContent = `Звук: ${label.toLowerCase()}`;
  elements.soundButton.setAttribute('aria-pressed', String(profile.sound));
  elements.pauseSoundButton.setAttribute('aria-pressed', String(profile.sound));
}

function syncMenu() {
  elements.bestScore.textContent = formatScore(profile.bestScore);
  elements.bestVoices.textContent = `${profile.bestVoices} / ${VOICE_COUNT}`;
  elements.winsValue.textContent = String(profile.wins);
  const saved = sanitizeRun(profile.savedRun);
  setHidden(elements.resumeButton, !saved);
  if (saved) elements.resumeMeta.textContent = `${saved.voice} / ${VOICE_COUNT} голосов · ${routeCode(saved.seed)}`;
  syncSoundButtons();
}

function syncHud() {
  if (!run) return;
  elements.voiceValue.textContent = `${String(Math.min(run.voice + 1, VOICE_COUNT)).padStart(2, '0')} / ${String(VOICE_COUNT).padStart(2, '0')}`;
  elements.scoreValue.textContent = String(Math.floor(run.score)).padStart(6, '0');
  elements.velocityValue.textContent = length2(run.vx, run.vz).toFixed(2);
  elements.stabilityMarks.forEach((mark, index) => mark.classList.toggle('is-lost', index >= run.stability));
  const percent = Math.round(run.rewindEnergy * 100);
  elements.rewindFill.style.height = `${percent}%`;
  elements.rewindLabel.textContent = rewinding ? 'НАЗАД' : `${percent}%`;
  elements.rewindButton.setAttribute('aria-disabled', String(run.rewindEnergy < REWIND_COST || rewinding));
  const target = world?.targets[run.voice];
  if (target) {
    const position = targetPosition(target, run.elapsed);
    elements.targetDistance.textContent = `${distance2(run.x, run.z, position.x, position.z).toFixed(1)} ОРБ`;
  }
}

function setGameChrome(visible) {
  for (const element of [elements.flightHeader, elements.hud, elements.rewindButton]) setHidden(element, !visible);
  elements.targetCopy.classList.toggle('is-visible', visible);
}

function clearWell() {
  well.active = false;
  well.power = 0;
  well.pointerId = null;
  elements.gravityMarker.classList.remove('is-active');
  audio.setDynamics(run ? length2(run.vx, run.vz) : 2.8, 0, rewinding);
}

function showMenu() {
  clearTimeout(crashTimeout);
  mode = 'menu';
  run = null;
  world = null;
  rewinding = false;
  history = [];
  particles = [];
  clearWell();
  setGameChrome(false);
  setHidden(elements.menu, false);
  setHidden(elements.briefing, true);
  setHidden(elements.pauseOverlay, true);
  setHidden(elements.resultOverlay, true);
  syncMenu();
}

function openBriefing(seed = null) {
  pendingSeed = seed;
  setHidden(elements.briefing, false);
  elements.briefingClose.focus({ preventScroll: true });
  audio.event('ui');
}

function closeBriefing() {
  setHidden(elements.briefing, true);
  pendingSeed = null;
  elements.startButton.focus({ preventScroll: true });
  audio.event('ui');
}

async function startRequested() {
  await audio.unlock();
  pendingSeed = randomSeed();
  if (!profile.tutorialSeen) openBriefing(pendingSeed);
  else launch(freshRun(pendingSeed));
}

function launch(candidate) {
  const valid = sanitizeRun(candidate) || candidate;
  if (!valid || !Number.isFinite(valid.seed)) return;
  run = sanitizeRun(valid) || freshRun(valid.seed);
  world = createWorld(run.seed);
  history = [snapshot(run)];
  rewindFrames = [];
  rewindIndex = 0;
  rewinding = false;
  particles = [];
  nearArmed = new Map(world.obstacles.map((obstacle) => [obstacle.id, true]));
  clearWell();
  mode = 'playing';
  profile.tutorialSeen = true;
  profile.savedRun = serializeRun(run);
  saveProfile();
  setHidden(elements.menu, true);
  setHidden(elements.briefing, true);
  setHidden(elements.pauseOverlay, true);
  setHidden(elements.resultOverlay, true);
  setGameChrome(true);
  syncHud();
  callout('СОЗДАЙ ТЯГУ', 'ЗАЖМИ ПАЛЕЦ В МИРЕ');
  audio.unlock();
  audio.event('ui');
}

function pauseGame(fromVisibility = false) {
  if (mode !== 'playing') return;
  mode = 'paused';
  clearWell();
  profile.savedRun = serializeRun(run);
  saveProfile();
  elements.pauseVoices.textContent = `${run.voice} / ${VOICE_COUNT}`;
  elements.pauseScore.textContent = formatScore(run.score);
  elements.pauseStability.textContent = `${run.stability} / 3`;
  syncSoundButtons();
  setHidden(elements.pauseOverlay, false);
  if (!fromVisibility) {
    elements.continueButton.focus({ preventScroll: true });
    audio.event('ui');
  }
}

function continueGame() {
  if (mode !== 'paused') return;
  mode = 'playing';
  setHidden(elements.pauseOverlay, true);
  previousFrame = performance.now();
  audio.unlock();
  audio.event('ui');
}

function restartCurrent() {
  if (!run) return;
  const seed = run.seed;
  launch(freshRun(seed));
}

function abandonToMenu() {
  profile.savedRun = null;
  saveProfile();
  showMenu();
}

function toggleSound() {
  profile.sound = !profile.sound;
  saveProfile();
  audio.setEnabled(profile.sound);
  syncSoundButtons();
  if (profile.sound) audio.unlock().then(() => audio.event('ui'));
}

function updateWellFromPointer(event) {
  if (!engine) return;
  const point = engine.screenToPlane(event.clientX, event.clientY, .35);
  const radius = Math.hypot(point.x, point.z);
  const scale = radius > OUTER_RADIUS - .4 ? (OUTER_RADIUS - .4) / radius : 1;
  well.x = point.x * scale;
  well.z = point.z * scale;
  cursorWorld = { x: well.x, z: well.z };
  const rect = elements.world.getBoundingClientRect();
  elements.gravityMarker.style.left = `${event.clientX - rect.left}px`;
  elements.gravityMarker.style.top = `${event.clientY - rect.top}px`;
}

function beginPointer(event) {
  if (mode !== 'playing' || rewinding || event.button > 0) return;
  event.preventDefault();
  audio.unlock();
  well.pointerId = event.pointerId;
  well.active = true;
  well.power = .16;
  updateWellFromPointer(event);
  elements.canvas.setPointerCapture?.(event.pointerId);
  elements.gravityMarker.classList.add('is-active');
  haptic(8);
}

function movePointer(event) {
  if (mode === 'playing') {
    const point = engine?.screenToPlane(event.clientX, event.clientY, .35);
    if (point) cursorWorld = point;
  }
  if (well.pointerId !== event.pointerId || !well.active) return;
  event.preventDefault();
  updateWellFromPointer(event);
}

function endPointer(event) {
  if (well.pointerId !== event.pointerId) return;
  elements.canvas.releasePointerCapture?.(event.pointerId);
  clearWell();
}

function beginRewind(manual = true) {
  if (mode !== 'playing' || rewinding || !run || history.length < 24) return false;
  if (manual && run.rewindEnergy < REWIND_COST) {
    callout('НЕТ ЭНЕРГИИ', 'ЛЕТИ БЛИЖЕ К МОНОЛИТАМ');
    haptic(18);
    return false;
  }
  clearWell();
  if (manual) {
    run.rewindEnergy = clamp(run.rewindEnergy - REWIND_COST, 0, 1);
    run.rewinds += 1;
  }
  const wanted = manual ? 105 : 78;
  const start = Math.max(0, history.length - wanted);
  rewindFrames = history.splice(start).reverse();
  rewindIndex = 0;
  rewinding = true;
  elements.world.classList.add('is-rewinding');
  audio.event('rewind');
  haptic([10, 20, 10]);
  callout(manual ? 'ОТКАТ' : 'АВАРИЙНЫЙ ОТКАТ', manual ? 'БУДУЩЕЕ ОТМЕНЕНО' : `УСТОЙЧИВОСТЬ ${run.stability} / 3`);
  return true;
}

function stepRewind(delta) {
  const count = Math.max(1, Math.round(delta * 60 * 2.25));
  for (let index = 0; index < count; index += 1) {
    const sample = rewindFrames[rewindIndex];
    if (!sample) {
      rewinding = false;
      elements.world.classList.remove('is-rewinding');
      run.invulnerable = 1.05;
      history.push(snapshot(run));
      return;
    }
    restoreSnapshot(run, sample);
    rewindIndex += 1;
  }
}

function spawnBurst(x, z, color = 'ivory', count = 18) {
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = .7 + Math.random() * 2.8;
    particles.push({
      x, y: .4 + Math.random() * .4, z,
      vx: Math.cos(angle) * speed,
      vy: .45 + Math.random() * 2.1,
      vz: Math.sin(angle) * speed,
      life: .65 + Math.random() * .65,
      scale: .05 + Math.random() * .1,
      spin: Math.random() * 5,
      kind: Math.random() > .35 ? 'shard' : 'spark',
      color: color === 'signal' ? [0.93,.18,.08,.9] : [.95,.92,.84,.86],
      emissive: color === 'signal' ? 1.1 : .5
    });
  }
}

function updateParticles(delta) {
  for (const particle of particles) {
    particle.life -= delta;
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.z += particle.vz * delta;
    particle.vy -= 2.2 * delta;
    particle.spin += delta * 4.5;
  }
  particles = particles.filter((particle) => particle.life > 0).slice(-52);
}

function handleVoice() {
  const target = world.targets[run.voice];
  if (!target) return;
  const point = targetPosition(target, run.elapsed);
  awardVoice(run);
  spawnBurst(point.x, point.z, 'signal', 28);
  audio.event('voice');
  haptic([14, 35, 22]);
  if (run.voice >= VOICE_COUNT) {
    finishRun(true);
    return;
  }
  callout(`ГОЛОС ${String(run.voice).padStart(2, '0')}`, `РЕЗОНАНС ×${Math.max(1, run.combo)}`);
}

function handleCollision(collision) {
  if (!collision || mode !== 'playing') return;
  run.stability -= 1;
  run.combo = 0;
  run.comboWindow = 0;
  run.score = Math.max(0, run.score - 260);
  spawnBurst(run.x, run.z, 'ivory', 24);
  pulse(elements.impactFlash);
  audio.event('impact');
  haptic([32, 22, 48]);
  if (run.stability <= 0) {
    mode = 'crashing';
    clearWell();
    callout(collision.type === 'sun' ? 'ПОГЛОЩЕНИЕ' : 'ОРБИТА РАЗРУШЕНА', 'УСТОЙЧИВОСТЬ 0 / 3');
    crashTimeout = setTimeout(() => finishRun(false), 850);
    return;
  }
  if (!beginRewind(false)) {
    const radius = Math.hypot(run.x, run.z) || 1;
    run.x = run.x / radius * 7;
    run.z = run.z / radius * 7;
    const tangent = Math.atan2(run.z, run.x) + Math.PI / 2;
    run.vx = Math.cos(tangent) * 2.75;
    run.vz = Math.sin(tangent) * 2.75;
    run.invulnerable = 1.2;
  }
}

function handleNearMiss() {
  const nearest = proximityFor(run, world);
  if (!nearest) return;
  const id = nearest.obstacle.id;
  if (nearest.distance > 1.5) nearArmed.set(id, true);
  if (nearest.distance > .3 && nearest.distance < .86 && nearArmed.get(id)) {
    nearArmed.set(id, false);
    const precision = awardNearMiss(run, nearest.distance);
    audio.event('near');
    haptic(10);
    callout(precision > 75 ? 'НА ВОЛОС' : 'БЛИЗКО', `ТОЧНОСТЬ ${precision}% · СЕРИЯ ×${run.combo}`);
  }
}

function finishRun(won) {
  if (!run || ['result', 'won'].includes(mode)) return;
  clearTimeout(crashTimeout);
  clearWell();
  rewinding = false;
  elements.world.classList.remove('is-rewinding');
  mode = won ? 'won' : 'result';
  const previousBest = profile.bestScore;
  profile.attempts += 1;
  profile.bestScore = Math.max(profile.bestScore, run.score);
  profile.bestVoices = Math.max(profile.bestVoices, run.voice);
  if (won) profile.wins += 1;
  profile.savedRun = null;
  saveProfile();
  setGameChrome(false);
  elements.resultKicker.textContent = won ? 'ВОСЕМЬ ГОЛОСОВ СОШЛИСЬ' : 'ОРБИТА РАЗРУШЕНА';
  elements.resultTitle.textContent = won ? 'Небо запело.' : 'Небо пережило тебя.';
  elements.resultScore.textContent = formatScore(run.score);
  elements.resultVoices.textContent = `${run.voice} / ${VOICE_COUNT}`;
  elements.resultNear.textContent = String(run.near);
  elements.resultTime.textContent = formatTime(run.elapsed);
  elements.resultNote.textContent = won
    ? `Машина ${routeCode(run.seed)} проснулась. Комета всё ещё вращается — видимо, божественная бюрократия сработала.`
    : run.voice >= 5
      ? 'До хора оставалось совсем немного. Монолитам, конечно, похуй.'
      : 'Чёрное солнце обычно не принимает апелляции.';
  setHidden(elements.recordBadge, !(run.score > previousBest));
  audio.event(won ? 'win' : 'lose');
  haptic(won ? [18,40,18,40,55] : [60,35,90]);
  const reveal = () => {
    if (won) pulse(elements.awakening);
    setHidden(elements.resultOverlay, false);
    elements.againButton.focus({ preventScroll: true });
  };
  if (won && !reducedMotion.matches) setTimeout(reveal, 820);
  else reveal();
}

function saveActiveRun() {
  if (!run || !['playing', 'paused'].includes(mode)) return;
  profile.savedRun = serializeRun(run);
  saveProfile();
}

function playingStep(delta, now) {
  if (!run || !world) return;
  if (rewinding) {
    stepRewind(delta);
  } else {
    if (keys.has(' ') && !well.active) {
      const speed = length2(run.vx, run.vz) || 1;
      well.active = true;
      well.power = Math.max(well.power, .25);
      well.x = cursorWorld.x || run.x + run.vx / speed * 3;
      well.z = cursorWorld.z || run.z + run.vz / speed * 3;
    }
    well.power = well.active ? clamp(well.power + delta * 2.1, .15, 1) : 0;
    stepOrbit(run, well, delta);
    history.push(snapshot(run));
    if (history.length > 270) history.shift();
    if (canCollectVoice(run, world)) handleVoice();
    if (mode === 'playing') handleCollision(collisionFor(run, world));
    if (mode === 'playing' && !rewinding) handleNearMiss();
  }
  if (now - lastSavedAt > 2200) {
    lastSavedAt = now;
    saveActiveRun();
  }
  syncHud();
}

function sceneForCurrentMode(delta) {
  if (run && world) {
    const target = world.targets[run.voice];
    return {
      time: run.elapsed,
      player: run,
      obstacles: world.obstacles.map((obstacle) => ({ obstacle, position: obstaclePosition(obstacle, run.elapsed) })),
      target: target ? targetPosition(target, run.elapsed) : null,
      well,
      trail: history,
      rewinding,
      particles,
      awakening: mode === 'won'
    };
  }

  demoTime += delta;
  const angle = demoTime * .22;
  const player = {
    x: Math.cos(angle) * 7.15,
    z: Math.sin(angle) * 7.15,
    vx: -Math.sin(angle) * 2.75,
    vz: Math.cos(angle) * 2.75
  };
  demoTrail.push({ x: player.x, z: player.z });
  if (demoTrail.length > 120) demoTrail.shift();
  const target = demoWorld.targets[1];
  return {
    time: demoTime,
    player,
    obstacles: demoWorld.obstacles.map((obstacle) => ({ obstacle, position: obstaclePosition(obstacle, demoTime) })),
    target: targetPosition(target, demoTime),
    well: { active: true, x: Math.cos(demoTime * .31) * 4.5, z: Math.sin(demoTime * .27) * 5.4, power: .6 },
    trail: demoTrail,
    rewinding: false,
    particles: []
  };
}

function frame(now) {
  const deltaMilliseconds = Math.min(50, now - previousFrame);
  const delta = deltaMilliseconds / 1000;
  previousFrame = now;
  if (mode === 'playing') playingStep(delta, now);
  updateParticles(delta);
  if (engine && !document.hidden) {
    const scene = sceneForCurrentMode(delta);
    engine.render(scene);
    engine.noteFrame(deltaMilliseconds);
    audio.setDynamics(run ? length2(run.vx, run.vz) : 2.8, well.active ? well.power : 0, rewinding);
  }
  frameHandle = requestAnimationFrame(frame);
}

function showFatal(error) {
  mode = 'fatal';
  setHidden(elements.loading, true);
  setHidden(elements.fatal, false);
  elements.fatalText.textContent = `${error?.message || 'WebGL недоступен'}. Обнови страницу или открой игру в Safari / Chrome.`;
  console.error('МЕССА: 3D initialization failed', error);
  workshop.recordError?.(error, 'webgl');
}

async function initialise() {
  try {
    engine = new MessaEngine(elements.canvas);
    engine.setReducedMotion(reducedMotion.matches);
    frameHandle = requestAnimationFrame(frame);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    elements.loading.classList.add('is-gone');
    setTimeout(() => setHidden(elements.loading, true), 420);
    mode = 'menu';
    syncMenu();
  } catch (error) {
    showFatal(error);
  }
}

elements.startButton.addEventListener('click', startRequested);
elements.resumeButton.addEventListener('click', async () => {
  await audio.unlock();
  const saved = sanitizeRun(profile.savedRun);
  if (saved) launch(saved);
  else syncMenu();
});
elements.howButton.addEventListener('click', () => openBriefing(null));
elements.soundButton.addEventListener('click', toggleSound);
elements.pauseSoundButton.addEventListener('click', toggleSound);
elements.briefingClose.addEventListener('click', closeBriefing);
elements.briefingStart.addEventListener('click', async () => {
  await audio.unlock();
  launch(freshRun(pendingSeed ?? randomSeed()));
});
elements.pauseButton.addEventListener('click', () => pauseGame(false));
elements.continueButton.addEventListener('click', continueGame);
elements.restartButton.addEventListener('click', restartCurrent);
elements.menuButton.addEventListener('click', abandonToMenu);
elements.rewindButton.addEventListener('click', () => beginRewind(true));
elements.againButton.addEventListener('click', restartCurrent);
elements.resultMenuButton.addEventListener('click', showMenu);
elements.reloadButton.addEventListener('click', () => location.reload());

elements.canvas.addEventListener('pointerdown', beginPointer, { passive: false });
elements.canvas.addEventListener('pointermove', movePointer, { passive: false });
elements.canvas.addEventListener('pointerup', endPointer, { passive: false });
elements.canvas.addEventListener('pointercancel', endPointer, { passive: false });
elements.canvas.addEventListener('lostpointercapture', endPointer);
elements.canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  cancelAnimationFrame(frameHandle);
  showFatal(new Error('Контекст WebGL потерян'));
});

window.addEventListener('keydown', (event) => {
  keys.add(event.key.toLowerCase());
  if (event.key === 'Escape') {
    if (mode === 'playing') pauseGame(false);
    else if (mode === 'paused') continueGame();
  }
  if (event.key.toLowerCase() === 'r') beginRewind(true);
  if (event.key === ' ') {
    event.preventDefault();
    audio.unlock();
  }
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.key.toLowerCase());
  if (event.key === ' ' && well.pointerId === null) clearWell();
});

window.addEventListener('resize', () => engine?.resize());
window.addEventListener('appviewportchange', () => engine?.resize());
window.addEventListener('pagehide', saveActiveRun);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    saveActiveRun();
    pauseGame(true);
  }
});
window.addEventListener('workshopopen', () => {
  if (mode === 'playing') pauseGame(true);
});

const portraitQuery = matchMedia('(orientation: portrait) and (max-width: 820px)');
portraitQuery.addEventListener?.('change', (event) => {
  if (event.matches && mode === 'playing') pauseGame(true);
  setTimeout(() => engine?.resize(), 180);
});
reducedMotion.addEventListener?.('change', (event) => engine?.setReducedMotion(event.matches));
watchConnectivity((online) => { document.documentElement.dataset.network = online ? 'online' : 'offline'; });

syncMenu();
initialise();
