import {
  angularDistance,
  energyDeltaForDive,
  generateRings,
  isAligned,
  normalizeAngle,
  scoreForDive,
  TARGET_ANGLE,
} from './game-core.js';
import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';

installMobileRuntime();

const VERSION = '1.0.0';
const STORAGE_KEY = 'pocket-works:prosvet:state';
const SETTINGS_KEY = 'pocket-works:prosvet:settings';
const RUN_KEY = 'pocket-works:prosvet:run';

const canvas = document.querySelector('#gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
const canvasWrap = document.querySelector('#canvasWrap');
const gameScreen = document.querySelector('#gameScreen');
const startOverlay = document.querySelector('#startOverlay');
const tutorialOverlay = document.querySelector('#tutorialOverlay');
const pauseOverlay = document.querySelector('#pauseOverlay');
const resultOverlay = document.querySelector('#resultOverlay');
const settingsLayer = document.querySelector('#settingsLayer');
const pauseButton = document.querySelector('#pauseButton');
const diveButton = document.querySelector('#diveButton');
const gestureHint = document.querySelector('#gestureHint');
const toast = document.querySelector('#toast');
const pulseFill = document.querySelector('#pulseFill');
const pulseValue = document.querySelector('#pulseValue');
const scoreValue = document.querySelector('#scoreValue');
const levelValue = document.querySelector('#levelValue');
const comboValue = document.querySelector('#comboValue');
const startButton = document.querySelector('#startButton');
const resumeButton = document.querySelector('#resumeButton');
const resumeMeta = document.querySelector('#resumeMeta');
const tutorialDoneButton = document.querySelector('#tutorialDoneButton');
const settingsButton = document.querySelector('#settingsButton');
const pauseSettingsButton = document.querySelector('#pauseSettingsButton');
const continueButton = document.querySelector('#continueButton');
const restartButton = document.querySelector('#restartButton');
const againButton = document.querySelector('#againButton');
const resultMenuButton = document.querySelector('#resultMenuButton');
const settingsBackdrop = document.querySelector('#settingsBackdrop');
const closeSettingsButton = document.querySelector('#closeSettingsButton');
const soundToggle = document.querySelector('#soundToggle');
const hapticToggle = document.querySelector('#hapticToggle');
const motionToggle = document.querySelector('#motionToggle');
const bestValue = document.querySelector('#bestValue');
const clearBestButton = document.querySelector('#clearBestButton');
const pauseScore = document.querySelector('#pauseScore');
const pauseLevel = document.querySelector('#pauseLevel');
const resultTitle = document.querySelector('#resultTitle');
const resultScore = document.querySelector('#resultScore');
const resultNote = document.querySelector('#resultNote');

const palette = {
  paper: '#eee5d3',
  paperDeep: '#d9ccb4',
  ink: '#263331',
  inkSoft: '#63706b',
  coral: '#c85f49',
  teal: '#2f746c',
  mustard: '#d5a83f',
};

const settings = loadJSON(SETTINGS_KEY, {
  sound: true,
  haptics: true,
  motion: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  tutorialSeen: false,
});
const profile = loadJSON(STORAGE_KEY, { best: 0, runs: 0 });

let mode = 'menu';
let running = false;
let lastFrame = performance.now();
let frameId = 0;
let size = { width: 1, height: 1, dpr: 1, cx: 0, cy: 0, outerRadius: 1 };
let state = createRun();
let drag = null;
let animation = null;
let shake = 0;
let flash = 0;
let pulseGlow = 0;
let toastTimer = 0;
let hintTimer = 0;
let audioContext = null;

function createRun(seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) {
  return {
    seed,
    level: 1,
    score: 0,
    combo: 0,
    energy: 100,
    ringIndex: 0,
    rings: generateRings(1, seed),
    startedAt: Date.now(),
  };
}

function loadJSON(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return parsed && typeof parsed === 'object' ? { ...fallback, ...parsed } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { console.warn('ПРОСВЕТ: не удалось сохранить данные', error); }
}

function validRun(saved) {
  return saved && Number.isFinite(saved.level) && Number.isFinite(saved.score) && Number.isFinite(saved.energy)
    && Number.isInteger(saved.ringIndex) && Array.isArray(saved.rings) && saved.rings.length >= 4;
}

function saveRun() {
  if (mode !== 'playing' && mode !== 'paused') return;
  saveJSON(RUN_KEY, { ...state, savedAt: Date.now() });
  refreshResumeButton();
}

function clearRun() {
  localStorage.removeItem(RUN_KEY);
  refreshResumeButton();
}

function refreshResumeButton() {
  const saved = loadJSON(RUN_KEY, null);
  const available = validRun(saved);
  resumeButton.hidden = !available;
  if (available) resumeMeta.textContent = `слой ${saved.level} · ${saved.score} очков`;
}

function resizeCanvas() {
  const rect = canvasWrap.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  size = {
    width: rect.width,
    height: rect.height,
    dpr,
    cx: rect.width / 2,
    cy: rect.height / 2 + Math.min(18, rect.height * 0.03),
    outerRadius: Math.min(rect.width * 0.43, rect.height * 0.39),
  };
}

function resetRun(showTutorial = true) {
  state = createRun();
  animation = null;
  drag = null;
  shake = 0;
  flash = 0;
  mode = 'playing';
  running = true;
  startOverlay.hidden = true;
  pauseOverlay.hidden = true;
  resultOverlay.hidden = true;
  pauseButton.hidden = false;
  gameScreen.hidden = false;
  lastFrame = performance.now();
  clearRun();
  updateHud();
  showToast('СЛОЙ 1');
  gestureHint.classList.add('visible');
  clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => gestureHint.classList.remove('visible'), 2200);
  if (showTutorial && !settings.tutorialSeen) {
    pauseGame(false);
    tutorialOverlay.hidden = false;
  }
  ensureLoop();
}

function resumeSavedRun() {
  const saved = loadJSON(RUN_KEY, null);
  if (!validRun(saved)) {
    clearRun();
    resetRun();
    return;
  }
  state = {
    seed: saved.seed >>> 0,
    level: Math.max(1, Math.floor(saved.level)),
    score: Math.max(0, Math.floor(saved.score)),
    combo: Math.max(0, Math.floor(saved.combo || 0)),
    energy: Math.max(1, Math.min(100, Number(saved.energy))),
    ringIndex: Math.max(0, Math.min(saved.rings.length - 1, Math.floor(saved.ringIndex))),
    rings: saved.rings.map((ring) => ({
      angle: normalizeAngle(Number(ring.angle) || 0),
      velocity: Math.max(-2.2, Math.min(2.2, Number(ring.velocity) || 0)),
      gapSize: Math.max(.2, Math.min(.8, Number(ring.gapSize) || .4)),
      notch: ring.notch === 2 ? 2 : 1,
      accent: Math.abs(Math.floor(ring.accent || 0)) % 3,
    })),
    startedAt: Number(saved.startedAt) || Date.now(),
  };
  mode = 'playing';
  running = true;
  startOverlay.hidden = true;
  pauseOverlay.hidden = true;
  resultOverlay.hidden = true;
  pauseButton.hidden = false;
  gameScreen.hidden = false;
  updateHud();
  showToast('ПРОДОЛЖАЕМ');
  lastFrame = performance.now();
  ensureLoop();
}

function showMenu() {
  if (mode === 'playing' || mode === 'paused') saveRun();
  mode = 'menu';
  running = false;
  startOverlay.hidden = false;
  pauseOverlay.hidden = true;
  resultOverlay.hidden = true;
  tutorialOverlay.hidden = true;
  pauseButton.hidden = true;
  refreshResumeButton();
}

function pauseGame(showOverlay = true) {
  if (mode !== 'playing') return;
  mode = 'paused';
  running = false;
  saveRun();
  pauseScore.textContent = state.score;
  pauseLevel.textContent = state.level;
  if (showOverlay) pauseOverlay.hidden = false;
}

function continueGame() {
  if (mode !== 'paused') return;
  mode = 'playing';
  running = true;
  pauseOverlay.hidden = true;
  tutorialOverlay.hidden = true;
  lastFrame = performance.now();
  ensureLoop();
}

function endRun() {
  mode = 'gameover';
  running = false;
  clearRun();
  profile.runs += 1;
  const previousBest = profile.best || 0;
  if (state.score > previousBest) profile.best = state.score;
  saveJSON(STORAGE_KEY, profile);
  bestValue.textContent = profile.best;
  pauseButton.hidden = true;
  resultTitle.textContent = `Слой ${state.level}`;
  resultScore.textContent = state.score;
  resultNote.textContent = state.score > previousBest ? 'Новый рекорд.' : `Рекорд: ${profile.best}`;
  resultOverlay.hidden = false;
  playSound('fail');
  vibrate([24, 45, 24]);
}

function update(dt) {
  if (mode !== 'playing') return;
  const decay = 3.9 + Math.min(7.5, state.level * 0.34);
  state.energy = Math.max(0, state.energy - decay * dt);
  pulseGlow = Math.max(0, pulseGlow - dt * 2.8);
  flash = Math.max(0, flash - dt * 3.7);
  shake = Math.max(0, shake - dt * 5.5);

  state.rings.forEach((ring, index) => {
    if (drag && index === state.ringIndex) return;
    const multiplier = index === state.ringIndex ? 1 : 0.45;
    ring.angle = normalizeAngle(ring.angle + ring.velocity * dt * multiplier);
  });

  if (animation) {
    animation.time += dt;
    if (animation.time >= animation.duration) {
      const type = animation.type;
      animation = null;
      if (type === 'dive') finishDive();
      if (type === 'level') startNextLevel();
    }
  }

  if (state.energy <= 0) endRun();
  updateHud();
}

function finishDive() {
  state.ringIndex += 1;
  if (state.ringIndex >= state.rings.length) {
    state.score += 240 + state.level * 45;
    state.energy = Math.min(100, state.energy + 26);
    state.combo += 1;
    animation = { type: 'level', time: 0, duration: settings.motion ? 0.72 : 0.06 };
    showToast('ЯДРО ОТКРЫТО');
    playSound('core');
    vibrate(18);
  } else {
    state.rings[state.ringIndex].velocity *= 1 + Math.min(.22, state.level * .018);
    saveRun();
  }
}

function startNextLevel() {
  state.level += 1;
  const seed = (state.seed + Math.imul(state.level, 0x9E3779B9)) >>> 0;
  state.rings = generateRings(state.level, seed);
  state.ringIndex = 0;
  state.energy = Math.min(100, state.energy + 12);
  showToast(`СЛОЙ ${state.level}`);
  playSound('level');
  saveRun();
}

function attemptDive() {
  if (mode !== 'playing' || animation) return;
  unlockAudio();
  const ring = state.rings[state.ringIndex];
  if (!ring) return;
  const distance = angularDistance(ring.angle, TARGET_ANGLE);
  const aligned = isAligned(ring.angle, ring.gapSize);

  if (aligned) {
    const precision = Math.max(0, 1 - distance / Math.max(.08, ring.gapSize / 2));
    const gained = scoreForDive(state.level, state.combo, precision);
    state.score += gained;
    state.combo += 1;
    state.energy = Math.min(100, state.energy + energyDeltaForDive(precision));
    pulseGlow = 1;
    animation = { type: 'dive', time: 0, duration: settings.motion ? 0.3 : 0.04, from: state.ringIndex };
    showToast(precision > .78 ? `ТОЧНО +${gained}` : `ПРОХОД +${gained}`);
    playSound(precision > .78 ? 'perfect' : 'pass');
    vibrate(precision > .78 ? [8, 18, 10] : 10);
  } else {
    state.combo = 0;
    state.energy = Math.max(0, state.energy - 22);
    ring.velocity = -ring.velocity * 0.72 + (ring.velocity >= 0 ? -0.18 : 0.18);
    shake = 1;
    flash = 1;
    showToast('ЗАКРЫТО');
    playSound('hit');
    vibrate(28);
    document.querySelector('.app-shell').classList.remove('shake');
    requestAnimationFrame(() => document.querySelector('.app-shell').classList.add('shake'));
  }
  updateHud();
  saveRun();
}

function updateHud() {
  scoreValue.textContent = String(state.score);
  levelValue.textContent = String(state.level);
  comboValue.textContent = String(state.combo);
  pulseValue.textContent = String(Math.ceil(state.energy));
  pulseFill.style.width = `${Math.max(0, Math.min(100, state.energy))}%`;
  pulseFill.parentElement.classList.toggle('low', state.energy < 28);
}

function activeRingMetrics(index) {
  const count = state.rings.length;
  const spacing = Math.min(34, size.outerRadius / (count + 1.4));
  const thickness = Math.max(12, Math.min(24, spacing * .62));
  const radius = size.outerRadius - index * spacing;
  return { radius, thickness, spacing };
}

function draw() {
  resizeCanvas();
  const { dpr, width, height, cx, cy } = size;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const bg = ctx.createRadialGradient(cx, cy - 20, 10, cx, cy, Math.max(width, height) * .62);
  bg.addColorStop(0, flash > 0 ? '#f0d5c9' : '#f4ecdd');
  bg.addColorStop(1, palette.paper);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  drawDeskMarks();

  ctx.save();
  if (shake > 0 && settings.motion) ctx.translate(Math.sin(performance.now() * .08) * shake * 5, 0);
  drawRings();
  drawCore();
  drawMarker();
  ctx.restore();

  if (animation?.type === 'dive') drawDivingPulse();
  if (animation?.type === 'level') drawLevelWash();
}

function drawDeskMarks() {
  ctx.save();
  ctx.strokeStyle = 'rgba(38,51,49,.06)';
  ctx.lineWidth = 1;
  const step = 28;
  for (let x = -size.height; x < size.width + size.height; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + size.height, size.height);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRings() {
  const count = state.rings.length;
  for (let index = 0; index < count; index += 1) {
    const ring = state.rings[index];
    const { radius, thickness } = activeRingMetrics(index);
    const active = index === state.ringIndex;
    const passed = index < state.ringIndex;
    const accent = [palette.coral, palette.teal, palette.mustard][ring.accent];

    ctx.save();
    ctx.translate(size.cx, size.cy);
    ctx.lineCap = 'butt';
    ctx.lineWidth = thickness + (active ? 3 : 0);
    ctx.strokeStyle = passed ? 'rgba(38,51,49,.12)' : active ? palette.ink : 'rgba(38,51,49,.48)';
    ctx.shadowColor = active ? 'rgba(38,51,49,.22)' : 'rgba(38,51,49,.08)';
    ctx.shadowBlur = active ? 14 : 7;
    ctx.shadowOffsetY = active ? 5 : 3;

    const gaps = ring.notch === 2 ? [ring.angle, normalizeAngle(ring.angle + Math.PI)] : [ring.angle];
    const segments = buildRingSegments(gaps, ring.gapSize);
    segments.forEach(([start, end]) => {
      ctx.beginPath();
      ctx.arc(0, 0, radius, start, end);
      ctx.stroke();
    });

    ctx.shadowColor = 'transparent';
    if (!passed) {
      gaps.forEach((gap) => {
        ctx.strokeStyle = accent;
        ctx.lineWidth = Math.max(4, thickness * .28);
        ctx.beginPath();
        ctx.arc(0, 0, radius, gap - ring.gapSize * .42, gap + ring.gapSize * .42);
        ctx.stroke();
      });
    }

    if (active) {
      ctx.strokeStyle = pulseGlow > 0 ? `rgba(47,116,108,${.24 + pulseGlow * .28})` : 'rgba(255,255,255,.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius - thickness * .26, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function buildRingSegments(gaps, gapSize) {
  const intervals = gaps.map((center) => {
    let start = normalizeAngle(center - gapSize / 2);
    let end = normalizeAngle(center + gapSize / 2);
    if (start < 0) start += Math.PI * 2;
    if (end < 0) end += Math.PI * 2;
    return start <= end ? [[start, end]] : [[start, Math.PI * 2], [0, end]];
  }).flat().sort((a, b) => a[0] - b[0]);

  const merged = [];
  intervals.forEach((interval) => {
    const last = merged[merged.length - 1];
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
    else merged.push(interval.slice());
  });

  const segments = [];
  let cursor = 0;
  merged.forEach(([start, end]) => {
    if (start > cursor) segments.push([cursor, start]);
    cursor = Math.max(cursor, end);
  });
  if (cursor < Math.PI * 2) segments.push([cursor, Math.PI * 2]);
  return segments;
}

function drawCore() {
  const count = state.rings.length;
  const inner = activeRingMetrics(count - 1);
  const radius = Math.max(18, inner.radius - inner.spacing * .62);
  const glow = ctx.createRadialGradient(size.cx, size.cy, 2, size.cx, size.cy, radius * 2.2);
  glow.addColorStop(0, pulseGlow > 0 ? palette.mustard : '#e4b849');
  glow.addColorStop(.38, 'rgba(213,168,63,.36)');
  glow.addColorStop(1, 'rgba(213,168,63,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(size.cx, size.cy, radius * 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = palette.mustard;
  ctx.beginPath();
  ctx.arc(size.cx, size.cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = palette.paperDeep;
  ctx.lineWidth = Math.max(4, radius * .22);
  ctx.stroke();
}

function drawMarker() {
  const index = Math.min(state.ringIndex, state.rings.length - 1);
  const { radius, thickness } = activeRingMetrics(index);
  const x = size.cx + Math.cos(TARGET_ANGLE) * radius;
  const y = size.cy + Math.sin(TARGET_ANGLE) * radius;
  const markerRadius = Math.max(5, thickness * .31);
  ctx.save();
  ctx.shadowColor = 'rgba(38,51,49,.28)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = palette.paper;
  ctx.beginPath();
  ctx.arc(x, y, markerRadius + 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.coral;
  ctx.beginPath();
  ctx.arc(x, y, markerRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawDivingPulse() {
  const progress = Math.min(1, animation.time / animation.duration);
  const eased = settings.motion ? 1 - Math.pow(1 - progress, 3) : progress;
  const from = activeRingMetrics(animation.from).radius;
  const toIndex = Math.min(animation.from + 1, state.rings.length - 1);
  const to = animation.from + 1 >= state.rings.length ? 0 : activeRingMetrics(toIndex).radius;
  const radius = from + (to - from) * eased;
  const x = size.cx + Math.cos(TARGET_ANGLE) * radius;
  const y = size.cy + Math.sin(TARGET_ANGLE) * radius;
  ctx.fillStyle = palette.coral;
  ctx.beginPath();
  ctx.arc(x, y, 8 - eased * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(200,95,73,${1 - progress})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 12 + progress * 18, 0, Math.PI * 2);
  ctx.stroke();
}

function drawLevelWash() {
  const progress = Math.min(1, animation.time / animation.duration);
  const alpha = Math.sin(progress * Math.PI) * .34;
  ctx.fillStyle = `rgba(213,168,63,${alpha})`;
  ctx.fillRect(0, 0, size.width, size.height);
}

function ensureLoop() {
  if (frameId) return;
  frameId = requestAnimationFrame(frame);
}

function frame(now) {
  frameId = 0;
  const dt = Math.min(.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (running) update(dt);
  draw();
  if (mode !== 'menu' || !startOverlay.hidden) frameId = requestAnimationFrame(frame);
}

function angleFromPointer(event) {
  const rect = canvas.getBoundingClientRect();
  return Math.atan2(event.clientY - rect.top - size.cy, event.clientX - rect.left - size.cx);
}

function startDrag(event) {
  if (mode !== 'playing' || animation) return;
  unlockAudio();
  event.preventDefault();
  canvas.setPointerCapture?.(event.pointerId);
  const angle = angleFromPointer(event);
  drag = {
    pointerId: event.pointerId,
    lastAngle: angle,
    lastTime: performance.now(),
    velocity: 0,
    moved: false,
  };
  gestureHint.classList.remove('visible');
}

function moveDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId || mode !== 'playing') return;
  event.preventDefault();
  const now = performance.now();
  const angle = angleFromPointer(event);
  const delta = normalizeAngle(angle - drag.lastAngle);
  const dt = Math.max(.008, (now - drag.lastTime) / 1000);
  if (Math.abs(delta) > .001) drag.moved = true;
  const ring = state.rings[state.ringIndex];
  ring.angle = normalizeAngle(ring.angle + delta);
  drag.velocity = drag.velocity * .55 + (delta / dt) * .45;
  drag.lastAngle = angle;
  drag.lastTime = now;
}

function endDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const ring = state.rings[state.ringIndex];
  if (ring && drag.moved) {
    const inertia = settings.motion ? Math.max(-2.15, Math.min(2.15, drag.velocity * .12)) : 0;
    ring.velocity = ring.velocity * .35 + inertia;
  }
  try { canvas.releasePointerCapture?.(event.pointerId); } catch {}
  drag = null;
  saveRun();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 720);
}

function unlockAudio() {
  if (!settings.sound) return;
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
}

function playSound(type) {
  if (!settings.sound) return;
  unlockAudio();
  if (!audioContext) return;
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(type === 'hit' ? 900 : 1800, now);
  const map = {
    pass: [360, 0.07, 'sine'],
    perfect: [510, 0.1, 'triangle'],
    hit: [120, 0.12, 'square'],
    core: [280, 0.18, 'triangle'],
    level: [420, 0.16, 'sine'],
    fail: [92, 0.24, 'sawtooth'],
  };
  const [frequency, duration, wave] = map[type] || map.pass;
  osc.type = wave;
  osc.frequency.setValueAtTime(frequency, now);
  if (type === 'perfect' || type === 'core') osc.frequency.exponentialRampToValueAtTime(frequency * 1.65, now + duration);
  if (type === 'hit' || type === 'fail') osc.frequency.exponentialRampToValueAtTime(Math.max(45, frequency * .55), now + duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(type === 'hit' ? 0.035 : 0.028, now + .008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(filter).connect(gain).connect(audioContext.destination);
  osc.start(now);
  osc.stop(now + duration + .03);
}

function vibrate(pattern) {
  if (settings.haptics && navigator.vibrate) navigator.vibrate(pattern);
}

function setToggle(button, value) {
  button.querySelector('em').textContent = value ? 'Вкл' : 'Выкл';
  button.setAttribute('aria-pressed', String(value));
}

function refreshSettings() {
  setToggle(soundToggle, settings.sound);
  setToggle(hapticToggle, settings.haptics);
  setToggle(motionToggle, settings.motion);
  bestValue.textContent = profile.best || 0;
}

function openSettings() {
  refreshSettings();
  settingsLayer.hidden = false;
}

function closeSettings() {
  settingsLayer.hidden = true;
}

function saveSettings() {
  saveJSON(SETTINGS_KEY, settings);
  refreshSettings();
}

startButton.addEventListener('click', () => resetRun());
resumeButton.addEventListener('click', resumeSavedRun);
pauseButton.addEventListener('click', () => pauseGame(true));
continueButton.addEventListener('click', continueGame);
restartButton.addEventListener('click', () => resetRun(false));
againButton.addEventListener('click', () => resetRun(false));
resultMenuButton.addEventListener('click', showMenu);
diveButton.addEventListener('click', attemptDive);
tutorialDoneButton.addEventListener('click', () => {
  settings.tutorialSeen = true;
  saveSettings();
  tutorialOverlay.hidden = true;
  continueGame();
});
settingsButton.addEventListener('click', openSettings);
pauseSettingsButton.addEventListener('click', openSettings);
settingsBackdrop.addEventListener('click', closeSettings);
closeSettingsButton.addEventListener('click', closeSettings);
soundToggle.addEventListener('click', () => { settings.sound = !settings.sound; saveSettings(); if (settings.sound) playSound('pass'); });
hapticToggle.addEventListener('click', () => { settings.haptics = !settings.haptics; saveSettings(); vibrate(10); });
motionToggle.addEventListener('click', () => { settings.motion = !settings.motion; saveSettings(); });
clearBestButton.addEventListener('click', () => {
  if (clearBestButton.dataset.confirm === 'true') {
    profile.best = 0;
    saveJSON(STORAGE_KEY, profile);
    clearBestButton.dataset.confirm = 'false';
    clearBestButton.textContent = 'Сбросить рекорд';
    refreshSettings();
  } else {
    clearBestButton.dataset.confirm = 'true';
    clearBestButton.textContent = 'Нажать ещё раз';
    window.setTimeout(() => {
      clearBestButton.dataset.confirm = 'false';
      clearBestButton.textContent = 'Сбросить рекорд';
    }, 1800);
  }
});

canvas.addEventListener('pointerdown', startDrag, { passive: false });
canvas.addEventListener('pointermove', moveDrag, { passive: false });
canvas.addEventListener('pointerup', endDrag, { passive: false });
canvas.addEventListener('pointercancel', endDrag, { passive: false });
canvas.addEventListener('lostpointercapture', (event) => { if (drag?.pointerId === event.pointerId) drag = null; });
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => window.setTimeout(resizeCanvas, 160));
window.addEventListener('pagehide', saveRun);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'playing') pauseGame(false);
  if (document.hidden) saveRun();
});
window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') { event.preventDefault(); attemptDive(); }
  if (event.code === 'Escape') {
    if (!settingsLayer.hidden) closeSettings();
    else if (mode === 'playing') pauseGame(true);
    else if (mode === 'paused') continueGame();
  }
});
window.addEventListener('appdatareset', () => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SETTINGS_KEY);
  localStorage.removeItem(RUN_KEY);
  Object.assign(profile, { best: 0, runs: 0 });
  Object.assign(settings, { sound: true, haptics: true, motion: true, tutorialSeen: false });
  refreshSettings();
  showMenu();
});

createWorkshopMode({
  appName: 'ПРОСВЕТ',
  version: VERSION,
  cachePrefix: 'prosvet-',
  storageNamespace: 'pocket-works:prosvet',
  onReset() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(RUN_KEY);
    window.dispatchEvent(new CustomEvent('appdatareset'));
  },
});

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});

refreshSettings();
refreshResumeButton();
resizeCanvas();
draw();
ensureLoop();
