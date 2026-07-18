'use strict';
const { createWorkshopMode } = globalThis.__RAT_DEPS__;

const APP_VERSION = '1.0.0';
const STORAGE_KEY = 'pocket-works:rat:state';
const WORLD = { width: 900, height: 1180 };
const TYPE_DATA = {
  swords: { label: 'МЕЧНИКИ', short: 'МЕЧИ', glyph: '◒', count: 26, hp: 7.0, speed: 66, range: 24, damage: .74, color: '#d78955' },
  spears: { label: 'КОПЕЙЩИКИ', short: 'КОПЬЯ', glyph: '↟', count: 24, hp: 7.6, speed: 55, range: 39, damage: .8, color: '#d2ad5d' },
  archers: { label: 'ЛУЧНИКИ', short: 'ЛУКИ', glyph: '⌁', count: 22, hp: 5.2, speed: 61, range: 210, damage: .64, color: '#8caa6d' }
};
const FORMATIONS = ['line', 'wedge', 'loose'];
const FORMATION_LABELS = { line: 'ЛИНИЯ', wedge: 'КЛИН', loose: 'РАССЫПНОЙ' };
const SLOT_X = { left: 220, center: 450, right: 680 };
const MODE_COPY = {
  observe: ['АВТОНОМНО', 'Полки исполняют предбоевой план без вмешательства.'],
  orders: ['РЕДКИЕ ПРИКАЗЫ', 'Раз в несколько секунд можно перенаправить один выбранный полк.'],
  flags: ['ПОЛКОВЫЕ ФЛАГИ', 'Каждый полк можно вести собственной целью без ожидания.']
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (min, max) => min + Math.random() * (max - min);
const choose = (items) => items[Math.floor(Math.random() * items.length)];
const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

const defaultState = {
  settings: { sound: true, haptics: true, speed: 1, difficulty: 'standard' },
  setup: [
    { id: 'swords', type: 'swords', slot: 'center', formation: 'wedge' },
    { id: 'spears', type: 'spears', slot: 'left', formation: 'line' },
    { id: 'archers', type: 'archers', slot: 'right', formation: 'loose' }
  ],
  lastMode: 'orders'
};

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return structuredClone(defaultState);
    return {
      settings: { ...defaultState.settings, ...(parsed.settings || {}) },
      setup: Array.isArray(parsed.setup) && parsed.setup.length === 3 ? parsed.setup : structuredClone(defaultState.setup),
      lastMode: MODE_COPY[parsed.lastMode] ? parsed.lastMode : 'orders'
    };
  } catch {
    return structuredClone(defaultState);
  }
}

let persistent = loadState();
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persistent));
}

createWorkshopMode({
  appName: 'РАТЬ',
  version: APP_VERSION,
  storageNamespace: 'pocket-works:rat',
  cachePrefix: 'rat-',
  onReset() {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }
});

const screens = {
  home: $('#homeScreen'),
  setup: $('#setupScreen'),
  battle: $('#battleScreen'),
  result: $('#resultScreen')
};
const dialogs = {
  rules: $('#rulesDialog'),
  pause: $('#pauseDialog'),
  settings: $('#settingsDialog')
};
const battleCanvas = $('#battleCanvas');
const battleCtx = battleCanvas.getContext('2d', { alpha: false });
const homeCanvas = $('#homeCanvas');
const homeCtx = homeCanvas.getContext('2d', { alpha: false });

let currentScreen = 'home';
let simulation = null;
let homeDemo = null;
let selectedRegiment = null;
let commandMode = persistent.lastMode;
let commandCooldown = 0;
let battlePaused = false;
let toastTimer = 0;
let lastFrame = performance.now();
let homeLastFrame = performance.now();
let dragState = null;
let audio = null;

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = .13;
  }
  unlock() {
    if (!persistent.settings.sound) return;
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  tone(freq, duration, type = 'triangle', gain = .3, slide = 0) {
    if (!persistent.settings.sound) return;
    this.unlock();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, now + duration);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(this.master * gain, now + .01);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + .02);
  }
  click() { this.tone(380, .055, 'square', .2, -80); }
  order() { this.tone(170, .16, 'sawtooth', .35, 90); setTimeout(() => this.tone(240, .13, 'triangle', .24, -30), 70); }
  hit() { this.tone(rand(90, 145), .045, 'square', .11, -25); }
  arrow() { this.tone(rand(520, 680), .07, 'triangle', .08, -220); }
  horn(win) {
    const seq = win ? [196, 247, 294] : [220, 175, 130];
    seq.forEach((f, i) => setTimeout(() => this.tone(f, .42, 'sawtooth', .24, win ? 26 : -20), i * 170));
  }
}
audio = new SoundEngine();

function vibrate(pattern) {
  if (persistent.settings.haptics && navigator.vibrate) navigator.vibrate(pattern);
}

function showScreen(name) {
  currentScreen = name;
  Object.entries(screens).forEach(([key, node]) => { node.hidden = key !== name; });
  if (name !== 'battle') battlePaused = true;
  if (name === 'home') ensureHomeDemo();
  if (name === 'setup') renderSetup();
}

function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}
function closeDialog(dialog) {
  if (dialog.open) dialog.close();
}

function resizeCanvas(canvas, ctx, worldWidth, worldHeight) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const scale = Math.max(width / worldWidth, height / worldHeight);
  const offsetX = (width - worldWidth * scale) / 2;
  const offsetY = (height - worldHeight * scale) / 2;
  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
  return { dpr, width, height, scale, offsetX, offsetY };
}

function screenToWorld(canvas, metrics, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const px = (clientX - rect.left) * metrics.dpr;
  const py = (clientY - rect.top) * metrics.dpr;
  return {
    x: (px - metrics.offsetX) / metrics.scale,
    y: (py - metrics.offsetY) / metrics.scale
  };
}

function formationOffsets(count, formation, facing = -1) {
  const offsets = [];
  if (formation === 'line') {
    const columns = Math.ceil(Math.sqrt(count * 1.85));
    const rows = Math.ceil(count / columns);
    const gapX = 20;
    const gapY = 22;
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / columns);
      const col = i % columns;
      offsets.push({ x: (col - (columns - 1) / 2) * gapX, y: (row - (rows - 1) / 2) * gapY * facing });
    }
  } else if (formation === 'wedge') {
    let index = 0;
    for (let row = 0; index < count; row++) {
      const rowCount = Math.min(row * 2 + 1, 11);
      for (let col = 0; col < rowCount && index < count; col++, index++) {
        offsets.push({ x: (col - (rowCount - 1) / 2) * 21, y: row * 22 * -facing });
      }
    }
    const avgY = offsets.reduce((sum, p) => sum + p.y, 0) / offsets.length;
    offsets.forEach((p) => { p.y -= avgY; });
  } else {
    const radius = Math.max(64, Math.sqrt(count) * 20);
    for (let i = 0; i < count; i++) {
      const angle = i * 2.399963 + rand(-.2, .2);
      const r = Math.sqrt((i + .5) / count) * radius;
      offsets.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r * .72 });
    }
  }
  return offsets;
}

function matchupMultiplier(attackerType, defenderType) {
  if (attackerType === 'spears' && defenderType === 'swords') return 1.26;
  if (attackerType === 'swords' && defenderType === 'archers') return 1.22;
  if (attackerType === 'archers' && defenderType === 'spears') return 1.2;
  if (defenderType === 'spears' && attackerType === 'swords') return .84;
  if (defenderType === 'swords' && attackerType === 'archers') return .86;
  if (defenderType === 'archers' && attackerType === 'spears') return .88;
  return 1;
}

