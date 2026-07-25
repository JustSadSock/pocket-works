const STORAGE_KEY = 'pocket-works:clada:state-v1';
const SETTINGS_KEY = 'pocket-works:clada:settings';
const VERSION = 1;
const GENERATION_STEPS = 220;
const MAX_ORGANISMS = 260;
const MAX_HISTORY = 72;
const TAU = Math.PI * 2;

const canvas = document.querySelector('#worldCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
const observatory = document.querySelector('#observatory');
const generationOutput = document.querySelector('#generation');
const populationOutput = document.querySelector('#population');
const speciesOutput = document.querySelector('#speciesCount');
const playButton = document.querySelector('#playButton');
const playGlyph = document.querySelector('#playGlyph');
const speedButton = document.querySelector('#speedButton');
const historyRange = document.querySelector('#historyRange');
const pastLabel = document.querySelector('#pastLabel');
const nowLabel = document.querySelector('#nowLabel');
const timeCaption = document.querySelector('#timeCaption');
const nowButton = document.querySelector('#nowButton');
const fossilBadge = document.querySelector('#fossilBadge');
const fossilGeneration = document.querySelector('#fossilGeneration');
const specimenLabel = document.querySelector('#specimenLabel');
const specimenSpecies = document.querySelector('#specimenSpecies');
const specimenName = document.querySelector('#specimenName');
const specimenHint = document.querySelector('#specimenHint');
const emptyState = document.querySelector('#emptyState');
const temperatureInput = document.querySelector('#temperatureInput');
const foodInput = document.querySelector('#foodInput');
const mutationInput = document.querySelector('#mutationInput');
const temperatureOutput = document.querySelector('#temperatureOutput');
const foodOutput = document.querySelector('#foodOutput');
const mutationOutput = document.querySelector('#mutationOutput');
const pressureSummary = document.querySelector('#pressureSummary');
const cataclysmButton = document.querySelector('#cataclysmButton');
const seedButton = document.querySelector('#seedButton');
const lensButton = document.querySelector('#lensButton');
const menuButton = document.querySelector('#menuButton');
const soundButton = document.querySelector('#soundButton');
const reseedEmpty = document.querySelector('#reseedEmpty');
const intro = document.querySelector('#intro');
const introStart = document.querySelector('#introStart');
const backdrop = document.querySelector('#backdrop');
const sheet = document.querySelector('#sheet');
const sheetKicker = document.querySelector('#sheetKicker');
const sheetTitle = document.querySelector('#sheetTitle');
const sheetBody = document.querySelector('#sheetBody');
const closeSheetButton = document.querySelector('#closeSheet');
const toast = document.querySelector('#toast');
const importInput = document.querySelector('#importInput');
const viewTabs = document.querySelector('#viewTabs');

const settings = loadSettings();
let audioContext = null;
let resizeObserver = null;
let state = null;
let selectedSeed = 'garden';
let lastFrame = performance.now();
let accumulator = 0;
let wasRunningBeforeHidden = false;
let toastTimer = 0;
let renderHits = [];
let pointerDown = null;
let dpr = 1;
let cssWidth = 1;
let cssHeight = 1;

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function distanceSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function hashNumber(value) {
  let x = value | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

function random() {
  if (!state) return Math.random();
  state.rng = hashNumber(state.rng || 123456789);
  return state.rng / 4294967296;
}

function randomRange(min, max) {
  return lerp(min, max, random());
}

function choose(list) {
  return list[Math.floor(random() * list.length) % list.length];
}

function gauss() {
  const u = Math.max(1e-7, random());
  const v = Math.max(1e-7, random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { sound: parsed.sound !== false };
  } catch {
    return { sound: true };
  }
}

function persistSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage can be unavailable in restricted contexts */ }
}

function removeStoredWorld() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage can be unavailable in restricted contexts */ }
}

function pulse(pattern = 8) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function tone(frequency = 260, duration = 0.05, gain = 0.025, type = 'sine') {
  if (!settings.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const volume = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(gain, audioContext.currentTime);
    volume.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    oscillator.connect(volume).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch {
    settings.sound = false;
    syncSoundButton();
  }
}

function chord(kind = 'birth') {
  if (!settings.sound) return;
  const notes = kind === 'extinct' ? [190, 146] : kind === 'shock' ? [90, 72, 54] : [294, 370, 440];
  notes.forEach((note, index) => setTimeout(() => tone(note, .11, .018, 'triangle'), index * 45));
}

function syncSoundButton() {
  soundButton.setAttribute('aria-pressed', String(settings.sound));
  soundButton.style.opacity = settings.sound ? '1' : '.42';
}

function showToast(message, duration = 2100) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, duration);
}

function safeText(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function makeGenome(base = null, mutationScale = 0) {
  const source = base || {
    size: randomRange(.72, 1.18),
    speed: randomRange(.62, 1.22),
    vision: randomRange(.6, 1.25),
    metabolism: randomRange(.68, 1.18),
    thermal: randomRange(.3, .72),
    diet: randomRange(0, .2),
    armor: randomRange(.05, .38),
    fertility: randomRange(.72, 1.25),
    hue: randomRange(74, 152),
    pattern: random()
  };
  if (!base) return source;
  const magnitude = .025 + mutationScale * .19;
  const mutate = (value, min, max, weight = 1) => clamp(value + gauss() * magnitude * weight, min, max);
  return {
    size: mutate(source.size, .42, 1.72, .8),
    speed: mutate(source.speed, .28, 1.8, 1),
    vision: mutate(source.vision, .25, 1.75, .9),
    metabolism: mutate(source.metabolism, .38, 1.65, .7),
    thermal: mutate(source.thermal, .04, .96, .75),
    diet: mutate(source.diet, 0, 1, .8),
    armor: mutate(source.armor, 0, 1, .65),
    fertility: mutate(source.fertility, .35, 1.7, .75),
    hue: (source.hue + gauss() * magnitude * 85 + 360) % 360,
    pattern: mutate(source.pattern, 0, 1, 1)
  };
}

function genomeDistance(a, b) {
  if (!a || !b) return 0;
  const hue = Math.min(Math.abs(a.hue - b.hue), 360 - Math.abs(a.hue - b.hue)) / 180;
  return Math.sqrt(
    (a.size - b.size) ** 2 * .8 +
    (a.speed - b.speed) ** 2 * .7 +
    (a.vision - b.vision) ** 2 * .45 +
    (a.metabolism - b.metabolism) ** 2 * .35 +
    (a.thermal - b.thermal) ** 2 * 1.2 +
    (a.diet - b.diet) ** 2 * 1.5 +
    (a.armor - b.armor) ** 2 * .7 +
    (a.fertility - b.fertility) ** 2 * .4 +
    hue ** 2 * .35
  );
}

const genus = ['Atra', 'Cava', 'Luma', 'Nema', 'Orbis', 'Plica', 'Rima', 'Sola', 'Terva', 'Vela', 'Mora', 'Fera'];
const epithet = ['viridis', 'lenta', 'celer', 'frigida', 'rubra', 'tenuis', 'armata', 'vorax', 'minor', 'alta', 'muta', 'vaga'];
const commonRoots = ['листохвост', 'моховик', 'нитеспин', 'искрожабр', 'серпокрыл', 'холодник', 'бронеспин', 'пыльцеед', 'круглобок', 'тихоход'];

