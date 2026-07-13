const STORAGE_KEY = 'pocket-works:shpilka:state:v1';
const TAU = Math.PI * 2;
const ROAD_WIDTH = 154;
const ROAD_HALF = ROAD_WIDTH / 2;
const CAR_RADIUS = 18;
const LAPS_TO_WIN = 3;
const SAMPLE_STEPS = 18;
const MAX_SPEED = 650;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
const hud = document.querySelector('#hud');
const controls = document.querySelector('#controls');
const speedCluster = document.querySelector('#speedCluster');
const speedValue = document.querySelector('#speedValue');
const positionValue = document.querySelector('#positionValue');
const lapValue = document.querySelector('#lapValue');
const lapTime = document.querySelector('#lapTime');
const bestLap = document.querySelector('#bestLap');
const countdownNode = document.querySelector('#countdown');
const raceMessage = document.querySelector('#raceMessage');
const recoverButton = document.querySelector('#recoverButton');
const startScreen = document.querySelector('#startScreen');
const pauseScreen = document.querySelector('#pauseScreen');
const finishScreen = document.querySelector('#finishScreen');
const finishTitle = document.querySelector('#finishTitle');
const finishKicker = document.querySelector('#finishKicker');
const finishSummary = document.querySelector('#finishSummary');
const resultsNode = document.querySelector('#results');

const input = { left: false, right: false, throttle: false, brake: false };
const controlBindings = [
  ['leftButton', 'left'],
  ['rightButton', 'right'],
  ['throttleButton', 'throttle'],
  ['brakeButton', 'brake']
];

let viewportWidth = 390;
let viewportHeight = 844;
let dpr = 1;
let mode = 'menu';
let previousMode = 'race';
let lastFrame = performance.now();
let accumulator = 0;
let raceElapsed = 0;
let countdownElapsed = 0;
let lastCountdownBeat = 4;
let finishDelay = 0;
let cameraZoom = 0.9;
let cameraShake = 0;
let cameraShakeX = 0;
let cameraShakeY = 0;
let particles = [];
let skidMarks = [];
let cars = [];
let player = null;
let raceOrder = [];
let props = [];
let saved = loadSavedState();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= TAU;
  while (angle < -Math.PI) angle += TAU;
  return angle;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(3).padStart(6, '0')}`;
}

function loadSavedState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      bestLap: Number.isFinite(parsed.bestLap) ? parsed.bestLap : null,
      sound: parsed.sound !== false
    };
  } catch {
    return { bestLap: null, sound: true };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // The race remains fully playable when private storage is unavailable.
  }
}

const TRACK_CONTROL_COUNT = 32;
const TRACK_PHASE = Math.PI / 4;
const controlPoints = Array.from({ length: TRACK_CONTROL_COUNT }, (_, index) => {
  const t = TRACK_PHASE + index / TRACK_CONTROL_COUNT * TAU;
  return {
    x: 820 * Math.sin(t) + 170 * Math.sin(3 * t),
    y: 540 * Math.sin(2 * t) + 90 * Math.sin(4 * t)
  };
});

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
  };
}

function buildTrack() {
  const points = [];
  const count = controlPoints.length;
  for (let i = 0; i < count; i += 1) {
    const p0 = controlPoints[(i - 1 + count) % count];
    const p1 = controlPoints[i];
    const p2 = controlPoints[(i + 1) % count];
    const p3 = controlPoints[(i + 2) % count];
    for (let step = 0; step < SAMPLE_STEPS; step += 1) {
      const t = step / SAMPLE_STEPS;
      const point = catmullRom(p0, p1, p2, p3, t);
      point.section = i + t;
      points.push(point);
    }
  }

  let length = 0;
  for (let i = 0; i < points.length; i += 1) {
    const previous = points[(i - 1 + points.length) % points.length];
    const next = points[(i + 1) % points.length];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const mag = Math.hypot(dx, dy) || 1;
    points[i].tx = dx / mag;
    points[i].ty = dy / mag;
    points[i].nx = -points[i].ty;
    points[i].ny = points[i].tx;
    if (i > 0) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    points[i].distance = length;
  }
  length += Math.hypot(points[0].x - points.at(-1).x, points[0].y - points.at(-1).y);
  points.totalLength = length;

  for (let i = 0; i < points.length; i += 1) {
    const a = points[(i - 5 + points.length) % points.length];
    const b = points[(i + 5) % points.length];
    points[i].curvature = Math.abs(wrapAngle(Math.atan2(b.ty, b.tx) - Math.atan2(a.ty, a.tx)));
  }
  return points;
}

const track = buildTrack();
const BRIDGE_START = 10.9 * SAMPLE_STEPS;
const BRIDGE_END = 13.15 * SAMPLE_STEPS;
const JUMP_TRIGGER_START = 11.46 * SAMPLE_STEPS;
const JUMP_TRIGGER_END = 12.08 * SAMPLE_STEPS;
const UNDERPASS_START = 26.9 * SAMPLE_STEPS;
const UNDERPASS_END = 29.15 * SAMPLE_STEPS;

function sectionIndexInRange(index, start, end) {
  return index >= start && index <= end;
}

function nearestTrackIndex(x, y, hint = null, radius = 82) {
  let bestIndex = 0;
  let bestDistance = Infinity;
  const count = track.length;
  if (hint == null) {
    for (let i = 0; i < count; i += 1) {
      const dx = x - track[i].x;
      const dy = y - track[i].y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    return { index: bestIndex, distance: Math.sqrt(bestDistance) };
  }

  for (let offset = -radius; offset <= radius; offset += 1) {
    const i = (hint + offset + count * 2) % count;
    const dx = x - track[i].x;
    const dy = y - track[i].y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return { index: bestIndex, distance: Math.sqrt(bestDistance) };
}

function distanceToTrack(x, y) {
  return nearestTrackIndex(x, y).distance;
}

function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function buildProps() {
  const random = mulberry32(2909);
  const items = [];
  for (let i = 0; i < 230; i += 1) {
    const x = lerp(-1250, 1050, random());
    const y = lerp(-920, 1040, random());
    if (distanceToTrack(x, y) < ROAD_HALF + 58) continue;
    const roll = random();
    items.push({
      x,
      y,
      size: lerp(8, 24, random()),
      rotation: random() * TAU,
      type: roll < 0.56 ? 'scrub' : roll < 0.78 ? 'rock' : roll < 0.93 ? 'marker' : 'stand'
    });
  }
  return items;
}

props = buildProps();

class RaceAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.engineGain = null;
    this.engine = null;
    this.engineSub = null;
    this.skidGain = null;
    this.skid = null;
    this.enabled = saved.sound;
  }

  async unlock() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.enabled ? 0.58 : 0;
      this.master.connect(this.context.destination);

      const engineFilter = this.context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 780;
      this.engineGain = this.context.createGain();
      this.engineGain.gain.value = 0;
      this.engine = this.context.createOscillator();
      this.engine.type = 'sawtooth';
      this.engineSub = this.context.createOscillator();
      this.engineSub.type = 'square';
      const subGain = this.context.createGain();
      subGain.gain.value = 0.13;
      this.engine.connect(engineFilter);
      this.engineSub.connect(subGain).connect(engineFilter);
      engineFilter.connect(this.engineGain).connect(this.master);
      this.engine.start();
      this.engineSub.start();

      const buffer = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < channel.length; i += 1) channel[i] = Math.random() * 2 - 1;
      const skidFilter = this.context.createBiquadFilter();
      skidFilter.type = 'bandpass';
      skidFilter.frequency.value = 1650;
      skidFilter.Q.value = 0.8;
      this.skidGain = this.context.createGain();
      this.skidGain.gain.value = 0;
      this.skid = this.context.createBufferSource();
      this.skid.buffer = buffer;
      this.skid.loop = true;
      this.skid.connect(skidFilter).connect(this.skidGain).connect(this.master);
      this.skid.start();
    }
    if (this.context.state !== 'running') await this.context.resume();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    saved.sound = enabled;
    saveState();
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(enabled ? 0.58 : 0, this.context.currentTime, 0.02);
    }
    updateSoundLabels();
  }

  update(car, active) {
    if (!this.context || !this.engineGain || !car) return;
    const now = this.context.currentTime;
    const speed = Math.hypot(car.vx, car.vy);
    const rpm = 46 + speed * 0.34 + (car.throttleInput || 0) * 38;
    this.engine.frequency.setTargetAtTime(rpm, now, 0.04);
    this.engineSub.frequency.setTargetAtTime(rpm * 0.51, now, 0.05);
    this.engineGain.gain.setTargetAtTime(active && this.enabled ? 0.055 + speed / MAX_SPEED * 0.11 : 0, now, 0.05);
    this.skidGain.gain.setTargetAtTime(active && this.enabled ? clamp(car.slip / 170, 0, 0.11) : 0, now, 0.035);
  }

  blip(kind = 'tick', strength = 1) {
    if (!this.context || !this.master || !this.enabled) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = kind === 'impact' ? 'square' : kind === 'jump' ? 'sine' : 'triangle';
    const frequency = kind === 'countdown' ? 330 : kind === 'go' ? 660 : kind === 'lap' ? 520 : kind === 'impact' ? 85 : kind === 'jump' ? 240 : 420;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (kind === 'impact') oscillator.frequency.exponentialRampToValueAtTime(48, now + 0.12);
    if (kind === 'jump') oscillator.frequency.exponentialRampToValueAtTime(520, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12 * strength, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'jump' ? 0.24 : 0.14));
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.3);
  }
}

const audio = new RaceAudio();
