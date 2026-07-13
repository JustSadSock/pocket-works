const STORAGE_KEY = 'pocket-works:shpilka:state:v2';
const TAU = Math.PI * 2;
const CAR_HALF_LENGTH = 27;
const CAR_HALF_WIDTH = 13;
const CAR_WHEELBASE = 45;
const MAX_SPEED = 760;
const SAMPLE_STEPS = 20;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
const hud = document.querySelector('#hud');
const controls = document.querySelector('#controls');
const speedCluster = document.querySelector('#speedCluster');
const speedValue = document.querySelector('#speedValue');
const gearValue = document.querySelector('#gearValue');
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
const routeMeta = document.querySelector('#routeMeta');
const routeNameNode = document.querySelector('#routeName');
const startButton = document.querySelector('#startButton');
const newRouteButton = document.querySelector('#newRouteButton');
const restartButtonFinish = document.querySelector('#restartButtonFinish');

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
let cameraZoom = 0.82;
let cameraAngle = 0;
let cameraX = 0;
let cameraY = 0;
let cameraShake = 0;
let cameraShakeX = 0;
let cameraShakeY = 0;
let particles = [];
let skidMarks = [];
let cars = [];
let player = null;
let raceOrder = [];
let props = [];
let track = [];
let trackSeed = 0;
let trackName = '';
let lapsToWin = 2;
let roadWidth = 164;
let roadHalf = roadWidth * 0.5;
let rampIndex = -1;
let theme = null;
let saved = loadSavedState();

const THEMES = [
  {
    id: 'salt', label: 'СОЛЯНОЙ ПЕТЛЕВИК', terrain: '#d4c79f', terrainDark: '#b9aa7f', asphalt: '#31332f',
    shoulder: '#a99a70', curbA: '#f2eee0', curbB: '#e35f33', propA: '#7b8460', propB: '#9f8c63'
  },
  {
    id: 'pine', label: 'СЕВЕРНЫЙ КОНТУР', terrain: '#aeb18d', terrainDark: '#818666', asphalt: '#30332f',
    shoulder: '#74795d', curbA: '#ebe6d6', curbB: '#d65b36', propA: '#4f6348', propB: '#70765c'
  },
  {
    id: 'port', label: 'ГРУЗОВОЙ УЗЕЛ', terrain: '#b7b0a0', terrainDark: '#8d887d', asphalt: '#2d302f',
    shoulder: '#77736b', curbA: '#f1ecdc', curbB: '#e16436', propA: '#8a5f44', propB: '#5d6b6f'
  },
  {
    id: 'clay', label: 'КРАСНЫЙ РАЗРЕЗ', terrain: '#c3a583', terrainDark: '#9d795c', asphalt: '#31322f',
    shoulder: '#8d6c51', curbA: '#f0ead8', curbB: '#d94f2d', propA: '#6d7758', propB: '#8c6048'
  }
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= TAU;
  while (angle < -Math.PI) angle += TAU;
  return angle;
}

function angleLerp(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(3).padStart(6, '0')}`;
}

function hashSeed(value) {
  let x = value | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
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

function loadSavedState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      sound: parsed.sound !== false,
      routeCounter: Number.isFinite(parsed.routeCounter) ? parsed.routeCounter : 0,
      routeRecords: parsed.routeRecords && typeof parsed.routeRecords === 'object' ? parsed.routeRecords : {}
    };
  } catch {
    return { sound: true, routeCounter: 0, routeRecords: {} };
  }
}

function saveState() {
  try {
    const entries = Object.entries(saved.routeRecords || {}).sort((a, b) => (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0)).slice(0, 18);
    saved.routeRecords = Object.fromEntries(entries);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Private browsing can deny storage. The game remains fully playable.
  }
}

function catmullRom(p0, p1, p2, p3, t, tension = 0.5) {
  const t2 = t * t;
  const t3 = t2 * t;
  const s = tension;
  return {
    x: (2 * p1.x + (-p0.x + p2.x) * s * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3) * 0.5,
    y: (2 * p1.y + (-p0.y + p2.y) * s * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3) * 0.5
  };
}
