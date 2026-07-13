import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { watchOrientation, lockOrientation, unlockOrientation } from '../../shared/capabilities/device.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';

installMobileRuntime();

const $ = (selector) => document.querySelector(selector);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, amount) => a + (b - a) * amount;
const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
const TAU = Math.PI * 2;

const VERSION = '2.1.0';
const NS = 'pocket-works:petlya-17';
const LAPS = 3;
const SEGMENT_LENGTH = 26;
const SEGMENT_COUNT = 270;
const TRACK_LENGTH = SEGMENT_LENGTH * SEGMENT_COUNT;
const DRAW_DISTANCE = 96;
const MAX_SPEED = 318;

const store = createVersionedStore({
  namespace: NS,
  version: 1,
  defaults: {
    settings: { sensitivity: 21, sound: true, haptics: true },
    records: { bestFinish: null, bestLapMs: null }
  }
});

const saved = store.getAll();
const settings = {
  sensitivity: clamp(Number(saved.settings?.sensitivity) || 21, 10, 35),
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
const draftBadge = $('#draft');
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
let sensorStop = null;
let sensorBaseline = null;
let sensorActive = false;
let countdown = 0;
let countMark = 4;
let steerTarget = 0;
let steer = 0;
let throttle = false;
let braking = false;
let raceTime = 0;
let lapStart = 0;
let bestLap = Infinity;
let passes = 0;
let previousPosition = 6;
let collisionCooldown = 0;
let shake = 0;
let lastGear = 1;
let roadPoints = [];
let nearHalf = 1;
let worldBank = 0;

const player = { distance: 0, speed: 0, x: 0, lap: 1 };

const track = Array.from({ length: SEGMENT_COUNT }, (_, index) => {
  const t = index / SEGMENT_COUNT;
  return {
    curve:
      Math.sin(t * TAU * 2.05 + 0.35) * 0.58 +
      Math.sin(t * TAU * 4.9 - 0.8) * 0.27 +
      Math.sin(t * TAU * 10.4 + 1.3) * 0.1,
    elevation:
      Math.sin(t * TAU * 2.8 + 0.7) * 0.42 +
      Math.sin(t * TAU * 7.2 - 0.25) * 0.13,
    zone: Math.floor(t * 6) % 3
  };
});

const botTemplates = [
  { name: 'ЯКОРЬ', color: '#d7ae42', stripe: '#15332c', pace: 0.94, aggression: 0.35, lane: -0.56 },
  { name: 'НОЖ', color: '#d04f2c', stripe: '#efe1bf', pace: 1.0, aggression: 0.9, lane: 0.22 },
  { name: 'ТЕНЬ', color: '#32564e', stripe: '#d9d0b6', pace: 0.97, aggression: 0.22, lane: -0.1 },
  { name: 'ГОНЧАЯ', color: '#e1d7bd', stripe: '#9f301c', pace: 0.985, aggression: 0.72, lane: 0.58 },
  { name: 'ИСКРА', color: '#4f7ea4', stripe: '#efc75c', pace: 0.955, aggression: 0.55, lane: 0.02 }
];

let bots = [];

function makeBots() {
  const gaps = [540, 760, 1010, 1320, 1660];
  return botTemplates.map((template, index) => ({
    ...template,
    id: index + 11,
    distance: gaps[index],
    speed: 0,
    x: template.lane,
    targetX: template.lane,
    decisionAt: 1.2 + index * 0.3,
    phase: Math.random() * TAU
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

      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 680;

      this.engine = this.context.createOscillator();
      this.engine.type = 'sawtooth';
      this.engine.connect(filter);

      const harmonicGain = this.context.createGain();
      harmonicGain.gain.value = 0.06;
      this.harmonic = this.context.createOscillator();
      this.harmonic.type = 'square';
      this.harmonic.connect(harmonicGain).connect(filter);
      filter.connect(this.master);
      this.engine.start();
      this.harmonic.start();

      const length = Math.floor(this.context.sampleRate * 0.22);
      this.noise = this.context.createBuffer(1, length, this.context.sampleRate);
      const channel = this.noise.getChannelData(0);
      for (let i = 0; i < length; i += 1) channel[i] = Math.random() * 2 - 1;
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  update(speed, active) {
    if (!this.context || !this.master || !settings.sound) return;
    const now = this.context.currentTime;
    const rpm = 38 + speed * 1.38;
    this.engine.frequency.setTargetAtTime(rpm, now, 0.035);
    this.harmonic.frequency.setTargetAtTime(rpm * 2.03, now, 0.035);
    this.master.gain.setTargetAtTime(active ? 0.065 + speed / MAX_SPEED * 0.06 : 0.0001, now, 0.06);
  }

  beep(frequency = 520, duration = 0.09, gainValue = 0.11) {
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

  impact(strength = 1) {
    if (!this.context || !settings.sound || !this.noise) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noise;
    filter.type = 'bandpass';
    filter.frequency.value = 130 + strength * 220;
    gain.gain.setValueAtTime(0.15 * strength, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + 0.2);
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

function trackAt(distance) {
  const raw = mod(distance / SEGMENT_LENGTH, SEGMENT_COUNT);
  const index = Math.floor(raw);
  const amount = raw - index;
  const current = track[index];
  const next = track[(index + 1) % SEGMENT_COUNT];
  return {
    curve: lerp(current.curve, next.curve, amount),
    elevation: lerp(current.elevation, next.elevation, amount),
    zone: current.zone
  };
}

function formatTime(milliseconds) {
  if (!Number.isFinite(milliseconds)) return '—';
  const value = Math.max(0, Math.floor(milliseconds));
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor(value % 60000 / 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(value % 1000).padStart(3, '0')}`;
}

function saveSettings() {
  store.set('settings', { ...settings });
}

function saveRecords() {
  store.set('records', { ...records });
  updateRecords();
}

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
  collisionCooldown = 0;
  shake = 0;
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
  draftBadge.hidden = true;
  mode = 'countdown';
  countdown = 3.7;
  countMark = 4;
  lastFrame = performance.now();
  say(tilt ? 'ДЕРЖИ РОВНО' : 'РУЛЬ — ПОЛОСА ВНИЗУ', 950);
  $('#start').disabled = false;
  $('#practice').disabled = false;
}

function draftStrength() {
  let strength = 0;
  for (const bot of bots) {
    const distance = bot.distance - player.distance;
    const lateral = Math.abs(bot.x - player.x);
    if (distance > 18 && distance < 210 && lateral < 0.28) {
      strength = Math.max(strength, (1 - distance / 210) * (1 - lateral / 0.28));
    }
  }
  return clamp(strength, 0, 1);
}

function updateBots(delta) {
  bots.forEach((bot, index) => {
    const curve = Math.abs(trackAt(bot.distance + 130).curve);
    const rubberBand = clamp((player.distance - bot.distance) / 1800, -1, 1) * 4;
    const target = clamp(
      242 + bot.pace * 52 - curve * 25 + rubberBand + Math.sin(raceTime * 0.00065 + bot.phase) * (2 + bot.aggression * 2),
      220,
      307
    );
    bot.speed += clamp(target - bot.speed, -62 * delta, 42 * delta);
    bot.distance += bot.speed / 3.6 * delta;

    if (raceTime / 1000 > bot.decisionAt) {
      const curveDirection = Math.sign(trackAt(bot.distance + 180).curve);
      const racingLine = -curveDirection * (0.13 + bot.aggression * 0.17);
      const traffic = Math.sin(bot.phase + raceTime * 0.00028 + index) * 0.46;
      bot.targetX = clamp(racingLine + traffic, -0.72, 0.72);
      bot.decisionAt = raceTime / 1000 + 1.4 + Math.random() * 2.1;
    }
    const lateralRate = 0.25 + bot.aggression * 0.26;
    bot.x += clamp(bot.targetX - bot.x, -delta * lateralRate, delta * lateralRate);
  });
}

function collide() {
  if (collisionCooldown > 0) return;
  for (const bot of bots) {
    const distance = bot.distance - player.distance;
    const lateral = Math.abs(bot.x - player.x);
    if (distance > -8 && distance < 18 && lateral < 0.18) {
      collisionCooldown = 0.5;
      player.speed *= 0.81;
      bot.speed *= 0.92;
      player.x += (player.x <= bot.x ? -1 : 1) * 0.11;
      shake = Math.max(shake, 9);
      audio.impact(0.9);
      haptic([18, 22, 28]);
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
      say(String(mark), 720);
      audio.beep(360 + (3 - mark) * 70, 0.11, 0.14);
      haptic(18);
    }
    if (countdown <= 0) {
      mode = 'racing';
      say('СТАРТ', 760);
      audio.beep(780, 0.18, 0.18);
      haptic([25, 28, 34]);
    }
    return;
  }

  if (mode !== 'racing') return;

  raceTime += delta * 1000;
  collisionCooldown = Math.max(0, collisionCooldown - delta);
  steer += (steerTarget - steer) * Math.min(1, delta * 9.5);

  const curve = trackAt(player.distance + 75).curve;
  const drafting = draftStrength();
  const limit = MAX_SPEED + drafting * 19;
  const engineForce = throttle ? 78 * (1 - player.speed / (limit + 48)) : 0;
  const drag = 7 + player.speed * 0.027;
  player.speed = clamp(player.speed + (engineForce - (braking ? 142 : 0) - drag) * delta, 0, limit);
  player.x += steer * (0.28 + player.speed / MAX_SPEED * 0.84) * delta;
  player.x -= curve * (player.speed / MAX_SPEED) ** 2 * 0.2 * delta;

  if (Math.abs(player.x) > 0.92) {
    player.speed = Math.max(0, player.speed - 86 * delta);
    shake = Math.max(shake, 2 + player.speed / 120);
  }
  if (Math.abs(player.x) > 1.14) {
    player.x = Math.sign(player.x) * 1.14;
    player.speed *= 0.75;
    shake = Math.max(shake, 8);
    audio.impact(0.7);
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
    say(player.lap === LAPS ? 'ПОСЛЕДНИЙ КРУГ' : `КРУГ ${player.lap}`, 1150);
    audio.beep(660, 0.16, 0.13);
    haptic([20, 20, 20]);
  }

  const currentPosition = position();
  if (currentPosition < previousPosition) passes += previousPosition - currentPosition;
  previousPosition = currentPosition;

  const gear = clamp(Math.floor(player.speed / 49) + 1, 1, 6);
  if (gear !== lastGear && player.speed > 18) {
    lastGear = gear;
    audio.beep(92 + gear * 18, 0.035, 0.034);
    haptic(8);
  }

  draftBadge.hidden = drafting < 0.12;
  if (!draftBadge.hidden) draftBadge.querySelector('b').textContent = `+${Math.round(drafting * 19)}`;
  if (player.distance >= LAPS * TRACK_LENGTH) finish();
  updateHud();
}

function finish() {
  if (mode === 'finished') return;
  mode = 'finished';
  controls.hidden = true;
  pauseButton.hidden = true;
  draftBadge.hidden = true;
  audio.update(0, false);
  audio.beep(840, 0.32, 0.16);
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
    'Последний, но хотя бы не парковался задом в контейнер.'
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
  draftBadge.hidden = true;
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

function pathStrip(points, multiplier, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = point.x - point.half * multiplier;
    if (index === 0) ctx.moveTo(x, point.y);
    else ctx.lineTo(x, point.y);
  });
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const point = points[i];
    ctx.lineTo(point.x + point.half * multiplier, point.y);
  }
  ctx.closePath();
  ctx.fill();
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
  const horizon = height * 0.305;
  const bottom = height * 0.79;
  nearHalf = Math.max(width * 0.42, 290);
  const farHalf = Math.max(width * 0.0055, 5);
  const points = [];
  let heading = 0;
  let lateral = 0;
  let elevation = 0;

  for (let i = 0; i <= DRAW_DISTANCE; i += 1) {
    const progress = i / DRAW_DISTANCE;
    const near = 1 - progress;
    const sampleDistance = player.distance + i * SEGMENT_LENGTH;
    const segment = trackAt(sampleDistance);
    heading += segment.curve * 0.0078;
    lateral += heading;
    elevation += segment.elevation * 0.0026;
    const perspective = near ** 2.42;
    const half = farHalf + (nearHalf - farHalf) * perspective;
    const y = horizon + (bottom - horizon) * near ** 2.14 - elevation * height * near * 0.56;
    const curveOffset = lateral * width * 0.0069 * (0.3 + near * 0.7);
    const x = width * 0.5 - player.x * half * 0.93 + curveOffset;
    points.push({ x, y, half, distance: i * SEGMENT_LENGTH, near, progress, sampleDistance });
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

function drawBackground(curve) {
  const horizon = height * 0.34;
  const parallax = -steer * width * 0.012 - curve * width * 0.02;
  const sky = ctx.createLinearGradient(0, 0, 0, height * 0.72);
  sky.addColorStop(0, '#66878f');
  sky.addColorStop(0.45, '#b8c3b5');
  sky.addColorStop(0.72, '#e5c48e');
  sky.addColorStop(1, '#956b4b');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(parallax * 0.3, 0);
  ctx.globalAlpha = 0.48;
  ctx.fillStyle = '#f2dfad';
  ctx.beginPath();
  ctx.arc(width * 0.76, height * 0.17, Math.max(25, width * 0.027), 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#607877';
  ctx.beginPath();
  ctx.moveTo(-60, horizon + 28);
  for (let x = -60; x <= width + 60; x += 46) {
    ctx.lineTo(x, horizon - 8 + Math.sin((x + parallax) * 0.008) * 18 + Math.sin(x * 0.019) * 7);
  }
  ctx.lineTo(width + 60, horizon + height * 0.15);
  ctx.lineTo(-60, horizon + height * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(parallax, 0);
  const dockY = horizon + height * 0.038;
  const blockWidth = Math.max(52, width / 18);
  for (let i = -3; i < 23; i += 1) {
    const x = i * blockWidth;
    const stack = 1 + Math.abs(i * 7) % 3;
    for (let row = 0; row < stack; row += 1) {
      const w = blockWidth * (0.82 - row * 0.05);
      const h = 17 + Math.abs(i + row * 2) % 3 * 5;
      ctx.fillStyle = ['#705f4d', '#7f6d54', '#5c6a60', '#8b5941'][Math.abs(i + row) % 4];
      ctx.fillRect(x + row * 4, dockY - h * (row + 1), w, h - 2);
    }
  }

  ctx.strokeStyle = '#2f403f';
  ctx.lineWidth = Math.max(2, width * 0.0018);
  for (let i = 0; i < 5; i += 1) {
    const x = width * (0.08 + i * 0.21);
    const mast = height * (0.13 + (i % 2) * 0.035);
    ctx.beginPath();
    ctx.moveTo(x, dockY);
    ctx.lineTo(x, dockY - mast);
    ctx.lineTo(x + width * 0.075, dockY - mast * 0.7);
    ctx.lineTo(x + width * 0.018, dockY - mast * 0.7);
    ctx.stroke();
  }
  ctx.restore();

  const ground = ctx.createLinearGradient(0, horizon, 0, height);
  ground.addColorStop(0, '#777d6d');
  ground.addColorStop(0.42, '#565c53');
  ground.addColorStop(1, '#2b302c');
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon + height * 0.075, width, height);

  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#e2ca92';
  ctx.fillRect(0, horizon + height * 0.075, width, 2);
  ctx.globalAlpha = 1;
}

function drawRoad(points) {
  pathStrip(points, 1.29, '#343b35');
  pathStrip(points, 1.19, '#71796e');
  pathStrip(points, 1.075, '#d3bf96');

  const asphalt = ctx.createLinearGradient(0, height * 0.3, 0, height * 0.82);
  asphalt.addColorStop(0, '#454a47');
  asphalt.addColorStop(0.6, '#292e2c');
  asphalt.addColorStop(1, '#161a18');
  pathStrip(points, 1, asphalt);

  const strokeRoadLine = (offset, color, lineWidth, alpha = 1) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = point.x + point.half * offset;
      if (index === 0) ctx.moveTo(x, point.y);
      else ctx.lineTo(x, point.y);
    });
    ctx.stroke();
    ctx.restore();
  };

  strokeRoadLine(-0.985, '#efe0bd', 2.1, 0.8);
  strokeRoadLine(0.985, '#efe0bd', 2.1, 0.8);
  strokeRoadLine(-0.27, '#0a0d0b', 4, 0.24);
  strokeRoadLine(0.27, '#0a0d0b', 4, 0.24);
  strokeRoadLine(-0.18, '#6c746e', 1, 0.13);
  strokeRoadLine(0.18, '#6c746e', 1, 0.13);

  const kerbLength = 29;
  const kerbCycle = 58;
  let offset = kerbCycle - mod(player.distance, kerbCycle);
  let kerbIndex = 0;
  for (let distance = offset; distance < DRAW_DISTANCE * SEGMENT_LENGTH; distance += kerbCycle) {
    const a = pointAt(distance);
    const b = pointAt(Math.min(distance + kerbLength, DRAW_DISTANCE * SEGMENT_LENGTH - 1));
    const fill = kerbIndex % 2 === 0 ? '#d75b35' : '#eee0bf';
    quad(
      { x: a.x - a.half * 1.075, y: a.y },
      { x: a.x - a.half * 1.006, y: a.y },
      { x: b.x - b.half * 1.006, y: b.y },
      { x: b.x - b.half * 1.075, y: b.y },
      fill
    );
    quad(
      { x: a.x + a.half * 1.006, y: a.y },
      { x: a.x + a.half * 1.075, y: a.y },
      { x: b.x + b.half * 1.075, y: b.y },
      { x: b.x + b.half * 1.006, y: b.y },
      fill
    );
    kerbIndex += 1;
  }

  const dashLength = 24;
  const dashCycle = 78;
  offset = dashCycle - mod(player.distance, dashCycle);
  for (let distance = offset; distance < DRAW_DISTANCE * SEGMENT_LENGTH; distance += dashCycle) {
    const a = pointAt(distance);
    const b = pointAt(Math.min(distance + dashLength, DRAW_DISTANCE * SEGMENT_LENGTH - 1));
    const widthA = Math.max(0.7, a.half * 0.0055);
    const widthB = Math.max(0.4, b.half * 0.0055);
    quad(
      { x: a.x - widthA, y: a.y },
      { x: a.x + widthA, y: a.y },
      { x: b.x + widthB, y: b.y },
      { x: b.x - widthB, y: b.y },
      '#d9d3c1'
    );
  }

  ctx.save();
  ctx.strokeStyle = '#7a817c';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.11;
  for (let i = 8; i < points.length - 7; i += 13) {
    const point = points[i];
    const next = points[i + 4];
    const lane = Math.sin(i * 2.73) * 0.7;
    ctx.beginPath();
    ctx.moveTo(point.x + point.half * lane, point.y);
    ctx.lineTo(next.x + next.half * (lane + Math.sin(i) * 0.03), next.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTrackside() {
  const drawRail = (side, multiplier, color, lineWidth) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    for (let i = 2; i < roadPoints.length; i += 1) {
      const point = roadPoints[i];
      const x = point.x + side * point.half * multiplier;
      if (i === 2) ctx.moveTo(x, point.y - 4);
      else ctx.lineTo(x, point.y - 4);
    }
    ctx.stroke();
  };

  ctx.lineCap = 'round';
  drawRail(-1, 1.22, '#d9d3bd', 5);
  drawRail(1, 1.22, '#d9d3bd', 5);
  drawRail(-1, 1.26, '#222824', 2);
  drawRail(1, 1.26, '#222824', 2);

  const markerSpacing = 148;
  let offset = markerSpacing - mod(player.distance, markerSpacing);
  let index = 0;
  for (let distance = offset; distance < DRAW_DISTANCE * SEGMENT_LENGTH; distance += markerSpacing) {
    if (distance < 70) continue;
    const point = pointAt(distance);
    const scale = clamp(point.half / nearHalf, 0.035, 1);
    const side = index % 2 === 0 ? -1 : 1;
    const x = point.x + side * point.half * 1.34;
    const postHeight = 70 * scale;
    ctx.fillStyle = '#1a201d';
    ctx.fillRect(x - 2 * scale, point.y - postHeight, 4 * scale, postHeight);
    ctx.fillStyle = index % 3 === 0 ? '#e0bf54' : '#cf5030';
    ctx.fillRect(x - 15 * scale, point.y - postHeight - 6 * scale, 30 * scale, 10 * scale);
    if (index % 4 === 0) {
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#f4df9b';
      ctx.beginPath();
      ctx.arc(x, point.y - postHeight - 2 * scale, 18 * scale, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    index += 1;
  }

  const containerSpacing = 430;
  offset = containerSpacing - mod(player.distance + 120, containerSpacing);
  index = 0;
  for (let distance = offset; distance < DRAW_DISTANCE * SEGMENT_LENGTH; distance += containerSpacing) {
    if (distance < 250) continue;
    const point = pointAt(distance);
    const scale = clamp(point.half / nearHalf, 0.04, 0.72);
    const side = index % 2 === 0 ? -1 : 1;
    const baseX = point.x + side * point.half * 1.62;
    const w = 150 * scale;
    const h = 42 * scale;
    for (let row = 0; row < 2 + (index % 2); row += 1) {
      ctx.fillStyle = ['#9d4229', '#28574f', '#b48639'][Math.abs(index + row) % 3];
      ctx.fillRect(baseX - w * 0.5, point.y - h * (row + 1), w, h - 2 * scale);
      ctx.strokeStyle = 'rgba(20,24,21,.45)';
      ctx.lineWidth = Math.max(1, scale);
      ctx.strokeRect(baseX - w * 0.5, point.y - h * (row + 1), w, h - 2 * scale);
    }
    index += 1;
  }

  const gantryDistance = 930 - mod(player.distance, 1180);
  if (gantryDistance > 170 && gantryDistance < DRAW_DISTANCE * SEGMENT_LENGTH) {
    const point = pointAt(gantryDistance);
    const scale = clamp(point.half / nearHalf, 0.05, 1);
    const beamY = point.y - 105 * scale;
    const left = point.x - point.half * 1.22;
    const right = point.x + point.half * 1.22;
    ctx.fillStyle = '#171c19';
    ctx.fillRect(left - 5 * scale, beamY, 10 * scale, point.y - beamY);
    ctx.fillRect(right - 5 * scale, beamY, 10 * scale, point.y - beamY);
    ctx.fillRect(left, beamY, right - left, 18 * scale);
    ctx.fillStyle = '#d85a31';
    ctx.fillRect(point.x - point.half * 0.34, beamY + 3 * scale, point.half * 0.68, 12 * scale);
    if (scale > 0.14) {
      ctx.fillStyle = '#f0e4c8';
      ctx.font = `900 ${Math.max(7, 18 * scale)}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('SECTOR 17', point.x, beamY + 14 * scale);
    }
  }
}

function drawCar(bot, point, distance) {
  const perspective = clamp(point.half / nearHalf, 0.018, 1);
  const carWidth = Math.max(10, 148 * perspective ** 0.92);
  const carHeight = carWidth * 0.49;
  const x = point.x + bot.x * point.half * 0.84;
  const y = point.y - carHeight * 0.58;

  ctx.save();
  ctx.translate(x, y);

  ctx.globalAlpha = 0.12 + perspective * 0.28;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, carHeight * 0.72, carWidth * 0.66, carHeight * 0.18, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#0d110f';
  ctx.fillRect(-carWidth * 0.57, carHeight * 0.18, carWidth * 0.17, carHeight * 0.57);
  ctx.fillRect(carWidth * 0.4, carHeight * 0.18, carWidth * 0.17, carHeight * 0.57);
  ctx.fillStyle = '#111512';
  ctx.fillRect(-carWidth * 0.67, -carHeight * 0.16, carWidth * 1.34, carHeight * 0.1);
  ctx.fillStyle = bot.color;
  ctx.fillRect(-carWidth * 0.58, -carHeight * 0.08, carWidth * 1.16, carHeight * 0.13);

  ctx.fillStyle = bot.color;
  ctx.beginPath();
  ctx.moveTo(-carWidth * 0.48, carHeight * 0.64);
  ctx.lineTo(-carWidth * 0.37, carHeight * 0.02);
  ctx.lineTo(-carWidth * 0.18, -carHeight * 0.12);
  ctx.lineTo(carWidth * 0.18, -carHeight * 0.12);
  ctx.lineTo(carWidth * 0.37, carHeight * 0.02);
  ctx.lineTo(carWidth * 0.48, carHeight * 0.64);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#171c19';
  ctx.fillRect(-carWidth * 0.24, carHeight * 0.06, carWidth * 0.48, carHeight * 0.22);
  ctx.fillStyle = bot.stripe;
  ctx.fillRect(-carWidth * 0.06, -carHeight * 0.08, carWidth * 0.12, carHeight * 0.7);
  ctx.fillStyle = '#090c0a';
  ctx.fillRect(-carWidth * 0.43, carHeight * 0.56, carWidth * 0.86, carHeight * 0.13);
  ctx.fillStyle = '#df5b35';
  ctx.fillRect(-carWidth * 0.06, carHeight * 0.43, carWidth * 0.12, carHeight * 0.08);

  if (perspective > 0.1) {
    ctx.fillStyle = '#efe4cb';
    ctx.font = `900 ${Math.max(7, carWidth * 0.09)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(bot.id, 0, carHeight * 0.62);
  }

  if (distance < 430 && perspective > 0.15) {
    const tagWidth = Math.max(48, carWidth * 0.7);
    ctx.fillStyle = 'rgba(12,16,14,.78)';
    ctx.fillRect(-tagWidth / 2, -carHeight * 0.62, tagWidth, Math.max(13, carHeight * 0.2));
    ctx.fillStyle = '#eee3c8';
    ctx.font = `800 ${Math.max(7, carWidth * 0.07)}px ui-monospace, monospace`;
    ctx.fillText(bot.name, 0, -carHeight * 0.46);
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
  const intensity = clamp((player.speed - 130) / 190, 0, 1);
  if (intensity <= 0) return;
  ctx.save();
  ctx.globalAlpha = intensity * 0.2;
  ctx.strokeStyle = '#f2e4c4';
  ctx.lineWidth = 1.5;
  const phase = mod(player.distance * 1.8, 82);
  for (let i = 0; i < 8; i += 1) {
    const y = height * 0.5 + mod(i * 73 + phase, height * 0.32);
    const length = 14 + intensity * 40;
    ctx.beginPath();
    ctx.moveTo(width * 0.025, y);
    ctx.lineTo(width * 0.025 + length, y + 2);
    ctx.moveTo(width * 0.975, y);
    ctx.lineTo(width * 0.975 - length, y + 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMirror(x, y, mirrorWidth, mirrorHeight, side) {
  ctx.save();
  ctx.fillStyle = '#0b0f0c';
  ctx.fillRect(x - 4, y - 4, mirrorWidth + 8, mirrorHeight + 8);
  ctx.beginPath();
  ctx.rect(x, y, mirrorWidth, mirrorHeight);
  ctx.clip();

  const glass = ctx.createLinearGradient(0, y, 0, y + mirrorHeight);
  glass.addColorStop(0, '#668486');
  glass.addColorStop(1, '#aeb3a2');
  ctx.fillStyle = glass;
  ctx.fillRect(x, y, mirrorWidth, mirrorHeight);
  ctx.fillStyle = '#343a35';
  ctx.beginPath();
  ctx.moveTo(x + mirrorWidth * 0.12, y + mirrorHeight);
  ctx.lineTo(x + mirrorWidth * 0.37, y + mirrorHeight * 0.55);
  ctx.lineTo(x + mirrorWidth * 0.63, y + mirrorHeight * 0.55);
  ctx.lineTo(x + mirrorWidth * 0.88, y + mirrorHeight);
  ctx.fill();

  const behind = bots
    .map((bot) => ({ bot, distance: player.distance - bot.distance }))
    .filter((entry) => entry.distance > 0 && entry.distance < 230)
    .filter((entry) => side < 0 ? entry.bot.x < player.x + 0.1 : entry.bot.x >= player.x - 0.1)
    .sort((a, b) => a.distance - b.distance)[0];

  if (behind) {
    const scale = clamp(1 - behind.distance / 250, 0.18, 0.7);
    ctx.fillStyle = behind.bot.color;
    ctx.fillRect(x + mirrorWidth * 0.5 - 15 * scale, y + mirrorHeight * 0.72 - 10 * scale, 30 * scale, 16 * scale);
    ctx.fillStyle = '#141815';
    ctx.fillRect(x + mirrorWidth * 0.5 - 10 * scale, y + mirrorHeight * 0.72 - 6 * scale, 20 * scale, 6 * scale);
  }
  ctx.restore();
}

function drawCockpit() {
  const centerX = width * 0.5;
  const top = height * 0.735;
  const carbon = ctx.createLinearGradient(0, top, 0, height);
  carbon.addColorStop(0, '#252b27');
  carbon.addColorStop(0.45, '#111613');
  carbon.addColorStop(1, '#070a08');

  ctx.fillStyle = carbon;
  ctx.beginPath();
  ctx.moveTo(0, height * 0.71);
  ctx.lineTo(width * 0.12, top);
  ctx.lineTo(width * 0.29, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(width, height * 0.71);
  ctx.lineTo(width * 0.88, top);
  ctx.lineTo(width * 0.71, height);
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = 0.13;
  ctx.strokeStyle = '#707770';
  ctx.lineWidth = 1;
  for (let i = 0; i < 18; i += 1) {
    const y = top + i * 7;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width * 0.24, y + 24);
    ctx.moveTo(width, y);
    ctx.lineTo(width * 0.76, y + 24);
    ctx.stroke();
  }
  ctx.restore();

  const nose = ctx.createLinearGradient(centerX, height * 0.6, centerX, height * 0.86);
  nose.addColorStop(0, '#f0e4c8');
  nose.addColorStop(1, '#9d9887');
  ctx.fillStyle = nose;
  ctx.beginPath();
  ctx.moveTo(centerX - width * 0.038, height * 0.61);
  ctx.lineTo(centerX + width * 0.038, height * 0.61);
  ctx.lineTo(centerX + width * 0.12, height * 0.84);
  ctx.lineTo(centerX - width * 0.12, height * 0.84);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#d85a31';
  ctx.beginPath();
  ctx.moveTo(centerX - width * 0.009, height * 0.61);
  ctx.lineTo(centerX + width * 0.009, height * 0.61);
  ctx.lineTo(centerX + width * 0.02, height * 0.84);
  ctx.lineTo(centerX - width * 0.02, height * 0.84);
  ctx.closePath();
  ctx.fill();

  const mirrorWidth = Math.min(width * 0.072, 112);
  const mirrorHeight = Math.min(height * 0.055, 34);
  drawMirror(width * 0.18, height * 0.64, mirrorWidth, mirrorHeight, -1);
  drawMirror(width * 0.82 - mirrorWidth, height * 0.64, mirrorWidth, mirrorHeight, 1);

  ctx.strokeStyle = '#0a0e0b';
  ctx.lineWidth = Math.max(11, height * 0.022);
  ctx.beginPath();
  ctx.moveTo(width * 0.26, height * 0.83);
  ctx.quadraticCurveTo(centerX, height * 0.61, width * 0.74, height * 0.83);
  ctx.stroke();
  ctx.strokeStyle = '#4a514b';
  ctx.lineWidth = Math.max(2, height * 0.0035);
  ctx.stroke();
  ctx.fillStyle = '#101512';
  ctx.fillRect(centerX - 7, height * 0.615, 14, height * 0.18);

  const wheelY = height * 0.895;
  const radius = Math.min(width, height) * 0.115;
  ctx.save();
  ctx.translate(centerX, wheelY);
  ctx.rotate(steer * 0.58);
  ctx.strokeStyle = '#0c100d';
  ctx.lineWidth = Math.max(12, radius * 0.2);
  ctx.beginPath();
  ctx.arc(0, 0, radius, Math.PI * 1.03, Math.PI * 1.97);
  ctx.stroke();
  ctx.strokeStyle = '#626a63';
  ctx.lineWidth = Math.max(2, radius * 0.03);
  ctx.stroke();
  ctx.fillStyle = '#181d19';
  ctx.beginPath();
  ctx.moveTo(-radius * 0.72, -radius * 0.12);
  ctx.lineTo(-radius * 0.31, radius * 0.18);
  ctx.lineTo(radius * 0.31, radius * 0.18);
  ctx.lineTo(radius * 0.72, -radius * 0.12);
  ctx.lineTo(radius * 0.48, radius * 0.58);
  ctx.lineTo(-radius * 0.48, radius * 0.58);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const gaugeWidth = Math.min(width * 0.135, 165);
  const gaugeHeight = Math.min(height * 0.09, 62);
  const gaugeX = centerX - gaugeWidth / 2;
  const gaugeY = wheelY - gaugeHeight * 0.56;
  ctx.fillStyle = 'rgba(4,8,6,.94)';
  ctx.fillRect(gaugeX, gaugeY, gaugeWidth, gaugeHeight);
  ctx.strokeStyle = '#697169';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(gaugeX, gaugeY, gaugeWidth, gaugeHeight);

  const rpm = clamp(player.speed / MAX_SPEED, 0, 1);
  for (let i = 0; i < 12; i += 1) {
    ctx.fillStyle = i / 12 < rpm ? (i > 9 ? '#e4532d' : '#d9bd55') : '#2d342f';
    ctx.fillRect(gaugeX + i * gaugeWidth / 12, gaugeY - 5, gaugeWidth / 12 - 1.5, 3);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#eee4cb';
  ctx.font = `900 ${Math.max(18, gaugeHeight * 0.48)}px ui-monospace, monospace`;
  ctx.fillText(String(Math.round(player.speed)).padStart(3, '0'), centerX, gaugeY + gaugeHeight * 0.52);
  const gear = clamp(Math.floor(player.speed / 49) + 1, 1, 6);
  ctx.fillStyle = '#e15b2e';
  ctx.font = `1000 ${Math.max(13, gaugeHeight * 0.24)}px ui-monospace, monospace`;
  ctx.fillText(gear, centerX, gaugeY + gaugeHeight * 0.84);
}

function drawVignette() {
  const vignette = ctx.createRadialGradient(
    width * 0.5,
    height * 0.43,
    height * 0.16,
    width * 0.5,
    height * 0.48,
    Math.max(width, height) * 0.68
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(0.72, 'rgba(0,0,0,.05)');
  vignette.addColorStop(1, 'rgba(0,0,0,.38)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function render() {
  const curve = trackAt(player.distance + 80).curve;
  const activeShake = shake > 0.1 ? shake : 0;
  const shakeX = activeShake ? (Math.random() - 0.5) * activeShake : 0;
  const shakeY = activeShake ? (Math.random() - 0.5) * activeShake * 0.42 : 0;
  shake *= 0.88;
  worldBank += (clamp(-steer * 0.012 - curve * 0.018, -0.035, 0.035) - worldBank) * 0.12;

  ctx.save();
  ctx.translate(shakeX, shakeY);
  ctx.translate(width * 0.5, height * 0.48);
  ctx.rotate(worldBank);
  ctx.translate(-width * 0.5, -height * 0.48);
  drawBackground(curve);
  const points = buildRoad();
  drawRoad(points);
  drawTrackside();
  drawBots();
  drawSpeedLines();
  ctx.restore();

  drawCockpit();
  drawVignette();
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
  Object.assign(settings, { sensitivity: 21, sound: true, haptics: true });
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
