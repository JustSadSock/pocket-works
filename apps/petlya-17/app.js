import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { watchOrientation, lockOrientation, unlockOrientation } from '../../shared/capabilities/device.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';

installMobileRuntime();

const $ = (selector) => document.querySelector(selector);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, amount) => a + (b - a) * amount;
const TAU = Math.PI * 2;
const NS = 'pocket-works:petlya-17';
const VERSION = '2.0.0';
const LAPS = 3;
const SEGMENT_LENGTH = 28;
const SEGMENT_COUNT = 240;
const TRACK_LENGTH = SEGMENT_LENGTH * SEGMENT_COUNT;
const DRAW_DISTANCE = 72;
const MAX_SPEED = 312;

const store = createVersionedStore({
  namespace: NS,
  version: 1,
  defaults: {
    settings: { sensitivity: 22, sound: true, haptics: true },
    records: { bestFinish: null, bestLapMs: null }
  }
});

const saved = store.getAll();
const settings = {
  sensitivity: clamp(Number(saved.settings?.sensitivity) || 22, 10, 35),
  sound: saved.settings?.sound !== false,
  haptics: saved.settings?.haptics !== false
};
let records = {
  bestFinish: Number.isFinite(saved.records?.bestFinish) ? saved.records.bestFinish : null,
  bestLapMs: Number.isFinite(saved.records?.bestLapMs) ? saved.records.bestLapMs : null
};

const canvas = $('#race');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
const menu = $('#menu');
const settingsScreen = $('#settings');
const pauseScreen = $('#pause');
const resultsScreen = $('#results');
const controls = $('#controls');
const steerPad = $('#steerPad');
const draft = $('#draft');
const message = $('#message');
const pauseButton = $('#pauseButton');
const gasButton = $('#gas');
const brakeButton = $('#brake');

let width = 1;
let height = 1;
let dpr = 1;
let lastFrame = performance.now();
let mode = 'menu';
let settingsReturn = 'menu';
let countdown = 0;
let countMark = 4;
let sensorStop = null;
let sensorBaseline = null;
let sensorActive = false;
let steerTarget = 0;
let steer = 0;
let throttle = false;
let braking = false;
let raceTime = 0;
let lapStart = 0;
let bestLap = Infinity;
let passes = 0;
let previousPosition = 6;
let shake = 0;
let collisionCooldown = 0;
let lastGear = 1;
let roadPoints = [];
let nearHalf = 1;

const player = { distance: 0, speed: 0, x: 0, lap: 1 };

const track = Array.from({ length: SEGMENT_COUNT }, (_, index) => {
  const t = index / SEGMENT_COUNT;
  return {
    curve:
      Math.sin(t * TAU * 2) * 0.42 +
      Math.sin(t * TAU * 5 + 0.8) * 0.22 +
      Math.sin(t * TAU * 9 - 0.4) * 0.08,
    elevation:
      Math.sin(t * TAU * 3 + 1.1) * 0.3 +
      Math.sin(t * TAU * 7) * 0.1
  };
});

const botTemplates = [
  { name: 'ЯКОРЬ', color: '#d4ad43', stripe: '#1b2924', pace: 0.93, aggression: 0.35, lane: -0.62 },
  { name: 'НОЖ', color: '#c84b2e', stripe: '#efe2c6', pace: 0.995, aggression: 0.92, lane: 0.3 },
  { name: 'ТЕНЬ', color: '#31544b', stripe: '#d8d2bc', pace: 0.97, aggression: 0.2, lane: -0.18 },
  { name: 'ГОНЧАЯ', color: '#ddd6c1', stripe: '#a9301d', pace: 0.98, aggression: 0.72, lane: 0.66 },
  { name: 'ИСКРА', color: '#4d78a0', stripe: '#efc654', pace: 0.95, aggression: 0.58, lane: 0.05 }
];

let bots = [];

function makeBots() {
  const startingGaps = [250, 430, 640, 880, 1120];
  return botTemplates.map((template, index) => ({
    ...template,
    id: index + 11,
    distance: startingGaps[index],
    speed: 0,
    x: template.lane,
    targetX: template.lane,
    decisionAt: 1.1 + index * 0.32,
    wobble: Math.random() * TAU
  }));
}

class EngineAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.engine = null;
    this.harmonic = null;
    this.noise = null;
  }

  async unlock() {
    if (!settings.sound) return;
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = 0.0001;
      this.master.connect(this.context.destination);

      this.engine = this.context.createOscillator();
      this.engine.type = 'sawtooth';
      this.harmonic = this.context.createOscillator();
      this.harmonic.type = 'square';
      const filter = this.context.createBiquadFilter();
      const harmonicGain = this.context.createGain();
      filter.type = 'lowpass';
      filter.frequency.value = 560;
      harmonicGain.gain.value = 0.075;
      this.engine.connect(filter);
      this.harmonic.connect(harmonicGain).connect(filter);
      filter.connect(this.master);
      this.engine.start();
      this.harmonic.start();

      const noiseLength = this.context.sampleRate * 0.2;
      this.noise = this.context.createBuffer(1, noiseLength, this.context.sampleRate);
      const channel = this.noise.getChannelData(0);
      for (let i = 0; i < noiseLength; i += 1) channel[i] = Math.random() * 2 - 1;
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  update(speed, active) {
    if (!this.context || !this.master || !settings.sound) return;
    const now = this.context.currentTime;
    const rpm = 42 + speed * 1.34;
    this.engine.frequency.setTargetAtTime(rpm, now, 0.035);
    this.harmonic.frequency.setTargetAtTime(rpm * 2.02, now, 0.035);
    this.master.gain.setTargetAtTime(active ? 0.072 + speed / MAX_SPEED * 0.052 : 0.0001, now, 0.07);
  }

  beep(frequency = 520, duration = 0.09, gainValue = 0.12) {
    if (!this.context || !settings.sound) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(gainValue, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration);
  }

  crash(strength = 1) {
    if (!this.context || !settings.sound || !this.noise) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noise;
    filter.type = 'bandpass';
    filter.frequency.value = 120 + strength * 180;
    gain.gain.setValueAtTime(0.16 * strength, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + 0.18);
    source.connect(filter).connect(gain).connect(this.context.destination);
    source.start();
  }

  mute() {
    if (this.context && this.master) this.master.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.03);
  }
}

const audio = new EngineAudio();
const haptic = (pattern) => {
  if (settings.haptics && navigator.vibrate) navigator.vibrate(pattern);
};

function modulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function trackAt(distance) {
  const raw = modulo(distance / SEGMENT_LENGTH, SEGMENT_COUNT);
  const index = Math.floor(raw);
  const amount = raw - index;
  const current = track[index];
  const next = track[(index + 1) % SEGMENT_COUNT];
  return {
    curve: lerp(current.curve, next.curve, amount),
    elevation: lerp(current.elevation, next.elevation, amount)
  };
}

function formatTime(milliseconds) {
  if (!Number.isFinite(milliseconds)) return '—';
  const value = Math.max(0, Math.floor(milliseconds));
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor(value % 60000 / 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(value % 1000).padStart(3, '0')}`;
}

const saveSettings = () => store.set('settings', { ...settings });
const saveRecords = () => {
  store.set('records', { ...records });
  updateRecords();
};

function updateRecords() {
  $('#bestFinish').textContent = records.bestFinish ? `${records.bestFinish}/6` : '—';
  $('#bestLap').textContent = formatTime(records.bestLapMs);
}

function updateSettings() {
  $('#sensitivity').value = settings.sensitivity;
  $('#sensitivityValue').textContent = `${settings.sensitivity}°`;
  for (const [id, enabled] of [['sound', settings.sound], ['haptics', settings.haptics]]) {
    const button = $(`#${id}`);
    button.textContent = enabled ? 'ВКЛ' : 'ВЫКЛ';
    button.classList.toggle('off', !enabled);
    button.setAttribute('aria-pressed', String(enabled));
  }
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(devicePixelRatio || 1, 1.75);
  width = Math.max(1, Math.floor(rect.width));
  height = Math.max(1, Math.floor(rect.height));
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function axis(event) {
  const angle = Number(screen.orientation?.angle ?? window.orientation ?? 0);
  if (angle === 90) return Number(event.beta) || 0;
  if (angle === 270 || angle === -90) return -(Number(event.beta) || 0);
  return Number(event.gamma) || 0;
}

async function enableTilt() {
  sensorBaseline = null;
  sensorStop?.();
  sensorStop = await watchOrientation((event) => {
    const value = axis(event);
    if (sensorBaseline === null) sensorBaseline = value;
    const normalized = clamp((value - sensorBaseline) / settings.sensitivity, -1, 1);
    steerTarget = Math.abs(normalized) < 0.035 ? 0 : normalized;
  });
  sensorActive = Boolean(sensorStop);
  return sensorActive;
}

function stopTilt() {
  sensorStop?.();
  sensorStop = null;
  sensorBaseline = null;
  sensorActive = false;
}

function say(text, duration = 900) {
  message.textContent = text;
  clearTimeout(say.timer);
  if (duration) say.timer = setTimeout(() => { message.textContent = ''; }, duration);
}

function position() {
  let result = 1;
  for (const bot of bots) if (bot.distance > player.distance) result += 1;
  return result;
}

function updateHud() {
  const currentPosition = position();
  $('#position').textContent = currentPosition;
  $('#lap').textContent = `${Math.min(player.lap, LAPS)}/${LAPS}`;
  const ahead = bots
    .map((bot) => bot.distance - player.distance)
    .filter((distance) => distance > 0)
    .sort((a, b) => a - b)[0];
  $('#gap').textContent = Number.isFinite(ahead)
    ? `+${(ahead / Math.max(player.speed / 3.6, 1)).toFixed(1)}с`
    : 'ЛИДЕР';
}

function resetRace() {
  Object.assign(player, { distance: 0, speed: 0, x: 0, lap: 1 });
  bots = makeBots();
  raceTime = 0;
  lapStart = 0;
  bestLap = Infinity;
  passes = 0;
  previousPosition = 6;
  shake = 0;
  collisionCooldown = 0;
  lastGear = 1;
  steer = 0;
  steerTarget = 0;
  throttle = false;
  braking = false;
  updateHud();
}

async function startRace(useTilt) {
  $('#start').disabled = true;
  $('#practice').disabled = true;
  await audio.unlock();
  let tilt = false;
  if (useTilt) tilt = await enableTilt();
  if (!tilt) {
    stopTilt();
    steerPad.hidden = false;
  } else {
    steerPad.hidden = true;
  }
  try { await lockOrientation('landscape'); } catch {}
  resetRace();
  menu.classList.add('hidden');
  settingsScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  resultsScreen.classList.add('hidden');
  controls.hidden = false;
  pauseButton.hidden = false;
  draft.hidden = true;
  mode = 'countdown';
  countdown = 3.7;
  countMark = 4;
  lastFrame = performance.now();
  say(tilt ? 'ДЕРЖИ РОВНО' : 'РУЛЬ — ПОЛОСА ВНИЗУ', 900);
  $('#start').disabled = false;
  $('#practice').disabled = false;
}

function draftStrength() {
  let strength = 0;
  for (const bot of bots) {
    const distance = bot.distance - player.distance;
    const lateral = Math.abs(bot.x - player.x);
    if (distance > 12 && distance < 190 && lateral < 0.31) {
      strength = Math.max(strength, (1 - distance / 190) * (1 - lateral / 0.31));
    }
  }
  return clamp(strength, 0, 1);
}

function updateBots(delta) {
  bots.forEach((bot, index) => {
    const curve = Math.abs(trackAt(bot.distance + 100).curve);
    const rubberBand = clamp((player.distance - bot.distance) / 1600, -1, 1) * 3.5;
    const target = clamp(
      244 + bot.pace * 50 - curve * 27 + rubberBand + Math.sin(raceTime * 0.0007 + bot.wobble) * (2 + bot.aggression * 2.3),
      220,
      304
    );
    bot.speed += clamp(target - bot.speed, -60 * delta, 40 * delta);
    bot.distance += bot.speed / 3.6 * delta;

    if (raceTime / 1000 > bot.decisionAt) {
      const curveDirection = Math.sign(trackAt(bot.distance + 165).curve);
      const tactical = -curveDirection * (0.16 + bot.aggression * 0.16);
      const random = Math.sin(bot.wobble + raceTime * 0.00031 + index) * 0.52;
      bot.targetX = clamp(tactical + random, -0.76, 0.76);
      bot.decisionAt = raceTime / 1000 + 1.3 + Math.random() * 2.1;
    }
    bot.x += clamp(bot.targetX - bot.x, -delta * (0.28 + bot.aggression * 0.24), delta * (0.28 + bot.aggression * 0.24));
  });
}

function collide() {
  if (collisionCooldown > 0) return;
  for (const bot of bots) {
    const distance = bot.distance - player.distance;
    const lateral = Math.abs(bot.x - player.x);
    if (distance > -8 && distance < 19 && lateral < 0.2) {
      collisionCooldown = 0.48;
      player.speed *= 0.82;
      bot.speed *= 0.91;
      player.x += (player.x <= bot.x ? -1 : 1) * 0.11;
      shake = Math.max(shake, 9);
      audio.crash(0.85);
      haptic([18, 22, 26]);
      say('КОНТАКТ', 500);
      return;
    }
  }
}

function updateRace(delta) {
  if (mode === 'countdown') {
    countdown -= delta;
    const mark = Math.ceil(countdown);
    if (mark !== countMark && mark > 0 && mark <= 3) {
      countMark = mark;
      say(String(mark), 760);
      audio.beep(360 + (3 - mark) * 70, 0.11, 0.14);
      haptic(18);
    }
    if (countdown <= 0) {
      mode = 'racing';
      say('СТАРТ', 800);
      audio.beep(760, 0.18, 0.18);
      haptic([25, 30, 35]);
    }
    return;
  }
  if (mode !== 'racing') return;

  raceTime += delta * 1000;
  collisionCooldown = Math.max(0, collisionCooldown - delta);
  steer += (steerTarget - steer) * Math.min(1, delta * 9);

  const curve = trackAt(player.distance + 55).curve;
  const drafting = draftStrength();
  const limit = MAX_SPEED + drafting * 20;
  const force = throttle ? 74 * (1 - player.speed / (limit + 45)) : 0;
  player.speed = clamp(player.speed + (force - (braking ? 137 : 0) - 8 - player.speed * 0.026) * delta, 0, limit);
  player.x += steer * (0.3 + player.speed / MAX_SPEED * 0.83) * delta;
  player.x -= curve * (player.speed / MAX_SPEED) ** 2 * 0.19 * delta;

  if (Math.abs(player.x) > 0.93) {
    player.speed = Math.max(0, player.speed - 83 * delta);
    shake = Math.max(shake, 2.2 + player.speed / 100);
  }
  if (Math.abs(player.x) > 1.16) {
    player.x = Math.sign(player.x) * 1.16;
    player.speed *= 0.76;
    shake = Math.max(shake, 8);
    audio.crash(0.7);
    haptic([24, 18, 22]);
  }

  const before = player.distance;
  player.distance += player.speed / 3.6 * delta;
  updateBots(delta);
  collide();

  const oldLap = Math.floor(before / TRACK_LENGTH);
  const newLap = Math.floor(player.distance / TRACK_LENGTH);
  if (newLap > oldLap && newLap < LAPS) {
    const lapTime = raceTime - lapStart;
    lapStart = raceTime;
    bestLap = Math.min(bestLap, lapTime);
    player.lap = newLap + 1;
    say(player.lap === LAPS ? 'ПОСЛЕДНИЙ КРУГ' : `КРУГ ${player.lap}`, 1200);
    audio.beep(650, 0.16, 0.13);
    haptic([20, 20, 20]);
  }

  const currentPosition = position();
  if (currentPosition < previousPosition) passes += previousPosition - currentPosition;
  previousPosition = currentPosition;

  const gear = clamp(Math.floor(player.speed / 48) + 1, 1, 6);
  if (gear !== lastGear && player.speed > 20) {
    lastGear = gear;
    audio.beep(90 + gear * 18, 0.035, 0.035);
    haptic(8);
  }

  draft.hidden = drafting < 0.12;
  if (!draft.hidden) draft.querySelector('b').textContent = `+${Math.round(drafting * 20)}`;
  if (player.distance >= LAPS * TRACK_LENGTH) finish();
  updateHud();
}

function finish() {
  if (mode === 'finished') return;
  mode = 'finished';
  controls.hidden = true;
  pauseButton.hidden = true;
  draft.hidden = true;
  audio.update(0, false);
  audio.beep(820, 0.32, 0.16);
  haptic([35, 35, 70]);

  const resultPosition = position();
  if (!records.bestFinish || resultPosition < records.bestFinish) records.bestFinish = resultPosition;
  if (Number.isFinite(bestLap) && (!records.bestLapMs || bestLap < records.bestLapMs)) records.bestLapMs = Math.round(bestLap);
  saveRecords();

  const names = ['Первое', 'Второе', 'Третье', 'Четвёртое', 'Пятое', 'Шестое'];
  const texts = [
    'Чисто. Быстро. Остальные могут оформить письменную жалобу.',
    'До победы не хватило одного злого торможения.',
    'Подиум есть. Переднее крыло тоже почти есть.',
    'Средний результат. Зато стены теперь знают твоё имя.',
    'Соперники уехали. Самоуважение осталось на пит-лейне.',
    'Финишировал последним, но технически всё ещё финишировал.'
  ];
  $('#resultTitle').textContent = `${names[resultPosition - 1]} место`;
  $('#resultText').textContent = texts[resultPosition - 1];
  $('#resultPosition').textContent = `${resultPosition}/6`;
  $('#resultTime').textContent = formatTime(raceTime);
  $('#resultLap').textContent = formatTime(bestLap);
  $('#resultPasses').textContent = passes;
  resultsScreen.classList.remove('hidden');
}

function goMenu() {
  mode = 'menu';
  stopTilt();
  unlockOrientation();
  controls.hidden = true;
  pauseButton.hidden = true;
  draft.hidden = true;
  pauseScreen.classList.add('hidden');
  resultsScreen.classList.add('hidden');
  settingsScreen.classList.add('hidden');
  menu.classList.remove('hidden');
  audio.mute();
  message.textContent = '';
  throttle = false;
  braking = false;
  updateRecords();
}

function pauseRace() {
  if (!['racing', 'countdown'].includes(mode)) return;
  mode = 'paused';
  throttle = false;
  braking = false;
  controls.hidden = true;
  pauseButton.hidden = true;
  pauseScreen.classList.remove('hidden');
  audio.update(player.speed, false);
}

function resumeRace() {
  if (mode !== 'paused') return;
  mode = 'racing';
  pauseScreen.classList.add('hidden');
  controls.hidden = false;
  pauseButton.hidden = false;
  lastFrame = performance.now();
}

function openSettings(from = 'menu') {
  settingsReturn = from;
  menu.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  settingsScreen.classList.remove('hidden');
  updateSettings();
}

function closeSettings() {
  settingsScreen.classList.add('hidden');
  (settingsReturn === 'pause' ? pauseScreen : menu).classList.remove('hidden');
}

function quad(a, b, c, d, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fill();
}

function buildRoad() {
  const horizon = height * 0.39;
  const bottom = height * 0.78;
  nearHalf = Math.max(width * 0.49, 320);
  const farHalf = Math.max(width * 0.012, 11);
  const points = [];
  let heading = 0;
  let lateral = 0;

  for (let i = 0; i <= DRAW_DISTANCE; i += 1) {
    const progress = i / DRAW_DISTANCE;
    const near = 1 - progress;
    const sampleDistance = player.distance + i * SEGMENT_LENGTH;
    const segment = trackAt(sampleDistance);
    heading += segment.curve * 0.00125;
    lateral += heading;
    const half = farHalf + (nearHalf - farHalf) * near ** 1.48;
    const y = horizon + (bottom - horizon) * near ** 1.58 - segment.elevation * height * 0.022 * progress * near;
    const x = width * 0.5 - player.x * half + lateral * half * 0.18;
    points.push({ x, y, half, distance: i * SEGMENT_LENGTH, sampleDistance });
  }
  roadPoints = points;
  return points;
}

function pointAt(distance) {
  const raw = clamp(distance / SEGMENT_LENGTH, 0, DRAW_DISTANCE - 0.001);
  const index = Math.floor(raw);
  const amount = raw - index;
  const a = roadPoints[index];
  const b = roadPoints[index + 1];
  return {
    x: lerp(a.x, b.x, amount),
    y: lerp(a.y, b.y, amount),
    half: lerp(a.half, b.half, amount)
  };
}

function pathAlong(points, multiplier, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const x = point.x - point.half * multiplier;
    if (i === 0) ctx.moveTo(x, point.y);
    else ctx.lineTo(x, point.y);
  }
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const point = points[i];
    ctx.lineTo(point.x + point.half * multiplier, point.y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawBackground(curve) {
  const sky = ctx.createLinearGradient(0, 0, 0, height * 0.72);
  sky.addColorStop(0, '#829da2');
  sky.addColorStop(0.5, '#c4c6ae');
  sky.addColorStop(1, '#e1d2ad');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const parallax = -steer * 15 - curve * 22;
  ctx.fillStyle = '#68807b';
  ctx.beginPath();
  ctx.moveTo(0, height * 0.38);
  for (let x = 0; x <= width; x += 55) {
    ctx.lineTo(x, height * 0.34 + Math.sin((x + parallax) * 0.011) * 14 + Math.sin(x * 0.004) * 10);
  }
  ctx.lineTo(width, height * 0.55);
  ctx.lineTo(0, height * 0.55);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.translate(parallax * 1.25, 0);
  const skylineY = height * 0.39;
  for (let i = -2; i < 18; i += 1) {
    const blockWidth = width / 15;
    const x = i * blockWidth;
    const blockHeight = 22 + (i % 4) * 12;
    ctx.fillStyle = i % 3 ? '#827765' : '#746a59';
    ctx.fillRect(x, skylineY - blockHeight, blockWidth * 0.72, blockHeight);
  }

  ctx.strokeStyle = '#8d4a34';
  ctx.lineWidth = Math.max(2, width * 0.002);
  const craneX = width * 0.28;
  ctx.beginPath();
  ctx.moveTo(craneX, skylineY);
  ctx.lineTo(craneX, skylineY - height * 0.18);
  ctx.lineTo(craneX + width * 0.08, skylineY - height * 0.12);
  ctx.lineTo(craneX + width * 0.035, skylineY - height * 0.12);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#9a8d6f';
  ctx.fillRect(0, height * 0.55, width, height * 0.45);
}

function drawRoad(points) {
  pathAlong(points, 1.34, '#6f7658');
  pathAlong(points, 1.15, '#efe3c5');
  pathAlong(points, 1.02, '#ccbea0');
  pathAlong(points, 1, '#30332f');

  ctx.strokeStyle = '#232622';
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.38;
  const textureSpacing = 28;
  let offset = textureSpacing - modulo(player.distance, textureSpacing);
  for (let distance = offset; distance < DRAW_DISTANCE * SEGMENT_LENGTH; distance += textureSpacing) {
    const point = pointAt(distance);
    const alpha = clamp(1 - distance / (DRAW_DISTANCE * SEGMENT_LENGTH), 0, 1);
    ctx.globalAlpha = 0.04 + alpha * 0.13;
    ctx.beginPath();
    ctx.moveTo(point.x - point.half * 0.96, point.y);
    ctx.lineTo(point.x + point.half * 0.96, point.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const stripeLength = 18;
  const stripeCycle = 36;
  offset = stripeCycle - modulo(player.distance, stripeCycle);
  for (let distance = offset; distance < DRAW_DISTANCE * SEGMENT_LENGTH; distance += stripeCycle) {
    const a = pointAt(distance);
    const b = pointAt(Math.min(distance + stripeLength, DRAW_DISTANCE * SEGMENT_LENGTH - 1));
    const leftOuterA = { x: a.x - a.half * 1.15, y: a.y };
    const leftInnerA = { x: a.x - a.half * 1.01, y: a.y };
    const leftInnerB = { x: b.x - b.half * 1.01, y: b.y };
    const leftOuterB = { x: b.x - b.half * 1.15, y: b.y };
    const rightInnerA = { x: a.x + a.half * 1.01, y: a.y };
    const rightOuterA = { x: a.x + a.half * 1.15, y: a.y };
    const rightOuterB = { x: b.x + b.half * 1.15, y: b.y };
    const rightInnerB = { x: b.x + b.half * 1.01, y: b.y };
    quad(leftOuterA, leftInnerA, leftInnerB, leftOuterB, '#bd472b');
    quad(rightInnerA, rightOuterA, rightOuterB, rightInnerB, '#bd472b');
  }

  const dashLength = 18;
  const dashCycle = 48;
  offset = dashCycle - modulo(player.distance, dashCycle);
  for (let distance = offset; distance < DRAW_DISTANCE * SEGMENT_LENGTH; distance += dashCycle) {
    const a = pointAt(distance);
    const b = pointAt(Math.min(distance + dashLength, DRAW_DISTANCE * SEGMENT_LENGTH - 1));
    const widthA = Math.max(1.2, a.half * 0.012);
    const widthB = Math.max(0.6, b.half * 0.012);
    quad(
      { x: a.x - widthA, y: a.y },
      { x: a.x + widthA, y: a.y },
      { x: b.x + widthB, y: b.y },
      { x: b.x - widthB, y: b.y },
      '#e7dec6'
    );
  }
}

function drawTrackside() {
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#292e2a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 2; i < roadPoints.length; i += 1) {
    const point = roadPoints[i];
    const x = point.x - point.half * 1.33;
    if (i === 2) ctx.moveTo(x, point.y - 5);
    else ctx.lineTo(x, point.y - 5);
  }
  ctx.stroke();
  ctx.beginPath();
  for (let i = 2; i < roadPoints.length; i += 1) {
    const point = roadPoints[i];
    const x = point.x + point.half * 1.33;
    if (i === 2) ctx.moveTo(x, point.y - 5);
    else ctx.lineTo(x, point.y - 5);
  }
  ctx.stroke();

  const markerSpacing = 170;
  let offset = markerSpacing - modulo(player.distance, markerSpacing);
  let index = 0;
  for (let distance = offset; distance < DRAW_DISTANCE * SEGMENT_LENGTH; distance += markerSpacing) {
    if (distance < 40) continue;
    const point = pointAt(distance);
    const scale = clamp(point.half / nearHalf, 0.04, 1);
    const side = index % 2 === 0 ? -1 : 1;
    const x = point.x + side * point.half * 1.42;
    const poleHeight = 82 * scale;
    ctx.fillStyle = '#202521';
    ctx.fillRect(x - 2 * scale, point.y - poleHeight, 4 * scale, poleHeight);
    ctx.fillStyle = index % 3 === 0 ? '#d2ad3c' : '#c2482c';
    ctx.fillRect(x - 18 * scale, point.y - poleHeight - 8 * scale, 36 * scale, 13 * scale);
    index += 1;
  }

  const boardDistance = 420 - modulo(player.distance, 760);
  if (boardDistance > 90 && boardDistance < DRAW_DISTANCE * SEGMENT_LENGTH) {
    const point = pointAt(boardDistance);
    const scale = clamp(point.half / nearHalf, 0.08, 1);
    const boardWidth = 240 * scale;
    const boardHeight = 56 * scale;
    const x = point.x - point.half * 1.45;
    const y = point.y - boardHeight - 28 * scale;
    ctx.fillStyle = '#161a18';
    ctx.fillRect(x - boardWidth * 0.5, y, boardWidth, boardHeight);
    ctx.fillStyle = '#d44b2b';
    ctx.fillRect(x + boardWidth * 0.18, y, boardWidth * 0.17, boardHeight);
    if (scale > 0.2) {
      ctx.fillStyle = '#efe4ca';
      ctx.font = `900 ${Math.max(8, 18 * scale)}px ui-monospace, monospace`;
      ctx.textAlign = 'left';
      ctx.fillText('ПЕТЛЯ 17', x - boardWidth * 0.42, y + boardHeight * 0.62);
    }
  }
}

function drawCar(bot, point, distance) {
  const perspective = clamp(point.half / nearHalf, 0.025, 1);
  const widthCar = Math.max(20, 174 * perspective ** 0.78);
  const heightCar = widthCar * 0.58;
  const x = point.x + bot.x * point.half * 0.84;
  const y = point.y - heightCar * 0.72;

  ctx.save();
  ctx.translate(x, y);

  ctx.globalAlpha = 0.15 + perspective * 0.35;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, heightCar * 0.78, widthCar * 0.68, heightCar * 0.18, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#121513';
  ctx.fillRect(-widthCar * 0.62, heightCar * 0.28, widthCar * 0.2, heightCar * 0.55);
  ctx.fillRect(widthCar * 0.42, heightCar * 0.28, widthCar * 0.2, heightCar * 0.55);

  ctx.fillStyle = bot.color;
  ctx.beginPath();
  ctx.moveTo(-widthCar * 0.48, heightCar * 0.72);
  ctx.lineTo(-widthCar * 0.34, heightCar * 0.02);
  ctx.lineTo(-widthCar * 0.18, -heightCar * 0.12);
  ctx.lineTo(widthCar * 0.18, -heightCar * 0.12);
  ctx.lineTo(widthCar * 0.34, heightCar * 0.02);
  ctx.lineTo(widthCar * 0.48, heightCar * 0.72);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = bot.stripe;
  ctx.fillRect(-widthCar * 0.075, -heightCar * 0.09, widthCar * 0.15, heightCar * 0.78);
  ctx.fillStyle = '#171b19';
  ctx.fillRect(-widthCar * 0.24, heightCar * 0.11, widthCar * 0.48, heightCar * 0.24);
  ctx.fillStyle = bot.color;
  ctx.fillRect(-widthCar * 0.58, -heightCar * 0.08, widthCar * 1.16, heightCar * 0.14);
  ctx.fillStyle = '#111411';
  ctx.fillRect(-widthCar * 0.64, -heightCar * 0.14, widthCar * 1.28, heightCar * 0.08);

  if (perspective > 0.14) {
    ctx.fillStyle = '#efe4cb';
    ctx.font = `900 ${Math.max(8, widthCar * 0.1)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(bot.id, 0, heightCar * 0.63);
  }

  if (distance < 230 && perspective > 0.18) {
    ctx.fillStyle = '#141816cc';
    const tagWidth = Math.max(54, widthCar * 0.62);
    ctx.fillRect(-tagWidth / 2, -heightCar * 0.48, tagWidth, Math.max(15, heightCar * 0.2));
    ctx.fillStyle = '#eee3c8';
    ctx.font = `800 ${Math.max(7, widthCar * 0.075)}px ui-monospace, monospace`;
    ctx.fillText(bot.name, 0, -heightCar * 0.32);
  }

  ctx.restore();
}

function drawBots() {
  bots
    .map((bot) => ({ bot, distance: bot.distance - player.distance }))
    .filter((entry) => entry.distance > 5 && entry.distance < DRAW_DISTANCE * SEGMENT_LENGTH)
    .sort((a, b) => b.distance - a.distance)
    .forEach((entry) => drawCar(entry.bot, pointAt(entry.distance), entry.distance));
}

function drawSpeedLines() {
  const intensity = clamp((player.speed - 90) / 220, 0, 1);
  if (intensity <= 0) return;
  ctx.save();
  ctx.globalAlpha = intensity * 0.28;
  ctx.strokeStyle = '#f2e5c8';
  ctx.lineWidth = 2;
  const phase = modulo(player.distance * 1.7, 70);
  for (let i = 0; i < 9; i += 1) {
    const y = height * 0.48 + modulo(i * 67 + phase, height * 0.38);
    const length = 20 + intensity * 46;
    ctx.beginPath();
    ctx.moveTo(width * 0.03, y);
    ctx.lineTo(width * 0.03 + length, y + 3);
    ctx.moveTo(width * 0.97, y);
    ctx.lineTo(width * 0.97 - length, y + 3);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMirror(x, y, mirrorWidth, mirrorHeight, side) {
  ctx.save();
  ctx.fillStyle = '#111513';
  ctx.fillRect(x - 5, y - 5, mirrorWidth + 10, mirrorHeight + 10);
  ctx.beginPath();
  ctx.rect(x, y, mirrorWidth, mirrorHeight);
  ctx.clip();
  const glass = ctx.createLinearGradient(0, y, 0, y + mirrorHeight);
  glass.addColorStop(0, '#6f8988');
  glass.addColorStop(1, '#b4b59f');
  ctx.fillStyle = glass;
  ctx.fillRect(x, y, mirrorWidth, mirrorHeight);
  ctx.fillStyle = '#343a36';
  ctx.beginPath();
  ctx.moveTo(x + mirrorWidth * 0.15, y + mirrorHeight);
  ctx.lineTo(x + mirrorWidth * 0.38, y + mirrorHeight * 0.55);
  ctx.lineTo(x + mirrorWidth * 0.62, y + mirrorHeight * 0.55);
  ctx.lineTo(x + mirrorWidth * 0.85, y + mirrorHeight);
  ctx.fill();

  const behind = bots
    .map((bot) => ({ bot, distance: player.distance - bot.distance }))
    .filter((entry) => entry.distance > 0 && entry.distance < 210)
    .filter((entry) => side < 0 ? entry.bot.x < player.x + 0.1 : entry.bot.x >= player.x - 0.1)
    .sort((a, b) => a.distance - b.distance)[0];
  if (behind) {
    const scale = clamp(1 - behind.distance / 230, 0.18, 0.72);
    ctx.fillStyle = behind.bot.color;
    ctx.fillRect(x + mirrorWidth * 0.5 - 17 * scale, y + mirrorHeight * 0.72 - 12 * scale, 34 * scale, 18 * scale);
    ctx.fillStyle = '#151817';
    ctx.fillRect(x + mirrorWidth * 0.5 - 12 * scale, y + mirrorHeight * 0.72 - 8 * scale, 24 * scale, 7 * scale);
  }
  ctx.restore();
}

function drawCockpit() {
  const cockpitTop = height * 0.67;
  const centerX = width * 0.5;

  ctx.fillStyle = '#101412';
  ctx.beginPath();
  ctx.moveTo(0, height * 0.69);
  ctx.lineTo(width * 0.16, cockpitTop);
  ctx.lineTo(width * 0.3, height * 0.77);
  ctx.lineTo(width * 0.7, height * 0.77);
  ctx.lineTo(width * 0.84, cockpitTop);
  ctx.lineTo(width, height * 0.69);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#262b27';
  ctx.beginPath();
  ctx.moveTo(0, height * 0.65);
  ctx.lineTo(width * 0.13, height * 0.68);
  ctx.lineTo(width * 0.24, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(width, height * 0.65);
  ctx.lineTo(width * 0.87, height * 0.68);
  ctx.lineTo(width * 0.76, height);
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#efe4ca';
  ctx.beginPath();
  ctx.moveTo(centerX - width * 0.115, height * 0.7);
  ctx.lineTo(centerX - width * 0.04, height * 0.61);
  ctx.lineTo(centerX + width * 0.04, height * 0.61);
  ctx.lineTo(centerX + width * 0.115, height * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#d64c2c';
  ctx.beginPath();
  ctx.moveTo(centerX - width * 0.014, height * 0.61);
  ctx.lineTo(centerX + width * 0.014, height * 0.61);
  ctx.lineTo(centerX + width * 0.024, height * 0.7);
  ctx.lineTo(centerX - width * 0.024, height * 0.7);
  ctx.closePath();
  ctx.fill();

  const mirrorWidth = Math.min(width * 0.09, 150);
  const mirrorHeight = Math.min(height * 0.07, 48);
  drawMirror(width * 0.16, height * 0.58, mirrorWidth, mirrorHeight, -1);
  drawMirror(width * 0.84 - mirrorWidth, height * 0.58, mirrorWidth, mirrorHeight, 1);

  ctx.strokeStyle = '#171b18';
  ctx.lineWidth = Math.max(10, height * 0.024);
  ctx.beginPath();
  ctx.moveTo(width * 0.22, height * 0.82);
  ctx.quadraticCurveTo(centerX, height * 0.56, width * 0.78, height * 0.82);
  ctx.stroke();
  ctx.strokeStyle = '#4a5049';
  ctx.lineWidth = Math.max(2, height * 0.004);
  ctx.stroke();

  const wheelY = height * 0.88;
  const radius = Math.min(width, height) * 0.15;
  ctx.save();
  ctx.translate(centerX, wheelY);
  ctx.rotate(steer * 0.52);
  ctx.strokeStyle = '#1b201c';
  ctx.lineWidth = Math.max(13, radius * 0.19);
  ctx.beginPath();
  ctx.arc(0, 0, radius, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();
  ctx.strokeStyle = '#626961';
  ctx.lineWidth = Math.max(2, radius * 0.025);
  ctx.stroke();
  ctx.fillStyle = '#202520';
  ctx.beginPath();
  ctx.moveTo(-radius * 0.68, -radius * 0.17);
  ctx.lineTo(-radius * 0.22, radius * 0.2);
  ctx.lineTo(radius * 0.22, radius * 0.2);
  ctx.lineTo(radius * 0.68, -radius * 0.17);
  ctx.lineTo(radius * 0.46, radius * 0.54);
  ctx.lineTo(-radius * 0.46, radius * 0.54);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const gaugeWidth = Math.min(width * 0.18, 210);
  const gaugeHeight = Math.min(height * 0.145, 96);
  const gaugeX = centerX - gaugeWidth / 2;
  const gaugeY = wheelY - gaugeHeight * 0.67;
  ctx.fillStyle = '#090d0b';
  ctx.fillRect(gaugeX, gaugeY, gaugeWidth, gaugeHeight);
  ctx.strokeStyle = '#697169';
  ctx.lineWidth = 2;
  ctx.strokeRect(gaugeX, gaugeY, gaugeWidth, gaugeHeight);

  const rpm = clamp(player.speed / MAX_SPEED, 0, 1);
  for (let i = 0; i < 14; i += 1) {
    ctx.fillStyle = i / 14 < rpm ? (i > 11 ? '#d54a2b' : '#d9bd55') : '#343a34';
    ctx.fillRect(gaugeX + i * gaugeWidth / 14, gaugeY - 7, gaugeWidth / 14 - 2, 4);
  }

  ctx.fillStyle = '#efe4ca';
  ctx.textAlign = 'center';
  ctx.font = `900 ${Math.max(22, gaugeHeight * 0.42)}px ui-monospace, monospace`;
  ctx.fillText(String(Math.round(player.speed)).padStart(3, '0'), centerX, gaugeY + gaugeHeight * 0.48);
  ctx.font = `800 ${Math.max(8, gaugeHeight * 0.13)}px ui-monospace, monospace`;
  ctx.fillText('КМ/Ч', centerX, gaugeY + gaugeHeight * 0.66);
  const gear = clamp(Math.floor(player.speed / 48) + 1, 1, 6);
  ctx.fillStyle = '#d75b2a';
  ctx.font = `1000 ${Math.max(15, gaugeHeight * 0.25)}px ui-monospace, monospace`;
  ctx.fillText(gear, centerX, gaugeY + gaugeHeight * 0.91);
}

function render() {
  const curve = trackAt(player.distance + 70).curve;
  const activeShake = shake > 0.1 ? shake : 0;
  const shakeX = activeShake ? (Math.random() - 0.5) * activeShake : 0;
  const shakeY = activeShake ? (Math.random() - 0.5) * activeShake * 0.42 : 0;
  shake *= 0.88;

  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawBackground(curve);
  const points = buildRoad();
  drawRoad(points);
  drawTrackside();
  drawBots();
  drawSpeedLines();
  drawCockpit();
  ctx.restore();
}

function frame(now) {
  const delta = clamp((now - lastFrame) / 1000, 0, 0.05);
  lastFrame = now;
  updateRace(delta);
  audio.update(player.speed, mode === 'racing' || mode === 'countdown');
  render();
  requestAnimationFrame(frame);
}

function hold(button, setter) {
  const end = (event) => {
    setter(false);
    button.classList.remove('active');
    if (event?.pointerId != null && button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId);
  };
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    setter(true);
    button.classList.add('active');
  });
  button.addEventListener('pointerup', end);
  button.addEventListener('pointercancel', end);
  button.addEventListener('lostpointercapture', end);
}

hold(gasButton, (value) => { throttle = value; });
hold(brakeButton, (value) => { braking = value; });

let steerPointer = null;
function steerFrom(event) {
  const rect = steerPad.getBoundingClientRect();
  steerTarget = clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1);
  steerPad.querySelector('i').style.left = `${(steerTarget + 1) * 50}%`;
}

steerPad.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  steerPointer = event.pointerId;
  steerPad.setPointerCapture?.(event.pointerId);
  steerFrom(event);
});
steerPad.addEventListener('pointermove', (event) => {
  if (event.pointerId === steerPointer) steerFrom(event);
});
const releaseSteer = (event) => {
  if (event.pointerId !== steerPointer) return;
  steerPointer = null;
  steerTarget = 0;
  steerPad.querySelector('i').style.left = '50%';
};
steerPad.addEventListener('pointerup', releaseSteer);
steerPad.addEventListener('pointercancel', releaseSteer);
steerPad.addEventListener('lostpointercapture', releaseSteer);

const keys = new Set();
window.addEventListener('keydown', (event) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space', 'Escape'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.code === 'Escape') {
    if (['racing', 'countdown'].includes(mode)) pauseRace();
    else if (mode === 'paused') resumeRace();
  }
  if (['ArrowUp', 'KeyW', 'Space'].includes(event.code)) throttle = true;
  if (['ArrowDown', 'KeyS'].includes(event.code)) braking = true;
  if (!sensorActive) {
    if (['ArrowLeft', 'KeyA'].includes(event.code)) steerTarget = -1;
    if (['ArrowRight', 'KeyD'].includes(event.code)) steerTarget = 1;
  }
});
window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
  if (['ArrowUp', 'KeyW', 'Space'].includes(event.code)) throttle = false;
  if (['ArrowDown', 'KeyS'].includes(event.code)) braking = false;
  if (!sensorActive && !['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].some((key) => keys.has(key))) steerTarget = 0;
});

$('#start').addEventListener('click', () => startRace(true));
$('#practice').addEventListener('click', () => startRace(false));
$('#settingsButton').addEventListener('click', () => openSettings('menu'));
$('#pauseSettings').addEventListener('click', () => openSettings('pause'));
pauseButton.addEventListener('click', pauseRace);
$('#resume').addEventListener('click', resumeRace);
$('#restart').addEventListener('click', () => startRace(sensorActive));
$('#quit').addEventListener('click', goMenu);
$('#again').addEventListener('click', () => startRace(sensorActive));
$('#resultsMenu').addEventListener('click', goMenu);
$('#closeSettings').addEventListener('click', closeSettings);

$('#sensitivity').addEventListener('input', (event) => {
  settings.sensitivity = Number(event.target.value);
  $('#sensitivityValue').textContent = `${settings.sensitivity}°`;
  sensorBaseline = null;
  saveSettings();
});
$('#sound').addEventListener('click', async () => {
  settings.sound = !settings.sound;
  saveSettings();
  updateSettings();
  if (settings.sound) await audio.unlock();
  else audio.mute();
});
$('#haptics').addEventListener('click', () => {
  settings.haptics = !settings.haptics;
  saveSettings();
  updateSettings();
  if (settings.haptics) haptic(18);
});

let resetArmed = false;
let resetTimer = 0;
$('#reset').addEventListener('click', (event) => {
  const button = event.currentTarget;
  if (!resetArmed) {
    resetArmed = true;
    button.textContent = 'НАЖМИ ЕЩЁ РАЗ ДЛЯ СБРОСА';
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      resetArmed = false;
      button.textContent = 'СБРОСИТЬ РЕКОРДЫ';
    }, 3500);
    return;
  }
  resetArmed = false;
  records = { bestFinish: null, bestLapMs: null };
  saveRecords();
  button.textContent = 'РЕКОРДЫ СБРОШЕНЫ';
  setTimeout(() => { button.textContent = 'СБРОСИТЬ РЕКОРДЫ'; }, 1200);
});

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => {
  sensorBaseline = null;
  setTimeout(resize, 120);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && ['racing', 'countdown'].includes(mode)) pauseRace();
});
window.addEventListener('pagehide', () => {
  saveSettings();
  saveRecords();
  audio.mute();
});
window.addEventListener('appdatareset', () => {
  records = { bestFinish: null, bestLapMs: null };
  Object.assign(settings, { sensitivity: 22, sound: true, haptics: true });
  updateRecords();
  updateSettings();
  goMenu();
});

createWorkshopMode({
  appName: 'ПЕТЛЯ 17',
  version: VERSION,
  cachePrefix: 'petlya-17-',
  storageNamespace: NS,
  onReset() {
    store.reset();
    window.dispatchEvent(new CustomEvent('appdatareset'));
  }
});
watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});

updateRecords();
updateSettings();
resize();
bots = makeBots();
requestAnimationFrame(frame);
