import { installMobileRuntime } from '../../shared/mobile-runtime.js';

installMobileRuntime();

const NS = 'pocket-works:gloamstep';
const SAVE_KEY = `${NS}:run:v1`;
const BEST_KEY = `${NS}:best:v1`;
const SETTINGS_KEY = `${NS}:settings:v1`;
const TUTORIAL_KEY = `${NS}:tutorial:v1`;
const SAVE_VERSION = 1;
const GRID_W = 11;
const GRID_H = 15;
const FLOOR_COUNT = 5;
const TAU = Math.PI * 2;
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.querySelector('#gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
const playfield = document.querySelector('#playfield');
const pauseButton = document.querySelector('#pauseButton');
const floorLabel = document.querySelector('#floorLabel');
const killsLabel = document.querySelector('#killsLabel');
const healthPips = document.querySelector('#healthPips');
const toastEl = document.querySelector('#toast');
const swipeHint = document.querySelector('#swipeHint');
const soundButton = document.querySelector('#soundButton');
const waitButton = document.querySelector('#waitButton');

const menuOverlay = document.querySelector('#menuOverlay');
const pauseOverlay = document.querySelector('#pauseOverlay');
const relicOverlay = document.querySelector('#relicOverlay');
const endOverlay = document.querySelector('#endOverlay');
const confirmOverlay = document.querySelector('#confirmOverlay');
const continueButton = document.querySelector('#continueButton');
const newRunButton = document.querySelector('#newRunButton');
const resumeButton = document.querySelector('#resumeButton');
const restartButton = document.querySelector('#restartButton');
const againButton = document.querySelector('#againButton');
const cancelRestartButton = document.querySelector('#cancelRestartButton');
const confirmRestartButton = document.querySelector('#confirmRestartButton');
const relicList = document.querySelector('#relicList');
const pauseSummary = document.querySelector('#pauseSummary');
const bestFloor = document.querySelector('#bestFloor');
const bestScore = document.querySelector('#bestScore');
const endEyebrow = document.querySelector('#endEyebrow');
const endTitle = document.querySelector('#endTitle');
const endCopy = document.querySelector('#endCopy');
const resultGrid = document.querySelector('#resultGrid');

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

const ENEMY_DATA = {
  gnawer: { name: 'Глодатель', hp: 1, damage: 1 },
  shade: { name: 'Тень', hp: 2, damage: 1 },
  guard: { name: 'Каменный страж', hp: 4, damage: 2 },
  boss: { name: 'Страж Пепла', hp: 10, damage: 2 }
};

const RELICS = [
  { id: 'heart', rune: 'H', name: 'Толстая свеча', desc: '+2 к максимуму жизни и сразу +2 жизни.' },
  { id: 'blade', rune: 'I', name: 'Чёрный нож', desc: '+1 урон каждой атаки.' },
  { id: 'eye', rune: 'O', name: 'Слепой глаз', desc: '+1 клетка радиуса света.' },
  { id: 'ward', rune: 'V', name: 'Железный фитиль', desc: 'Первый удар на каждом этаже слабее на 1.' },
  { id: 'feather', rune: 'S', name: 'Пепельное перо', desc: '12% шанс полностью уклониться от удара.' },
  { id: 'blood', rune: 'IV', name: 'Красный воск', desc: 'Каждое четвёртое убийство лечит 1 жизнь.' },
  { id: 'spark', rune: '*', name: 'Последняя искра', desc: 'Один раз переживи смертельный удар с 1 жизнью.' },
  { id: 'crit', rune: 'X', name: 'Треснувшее лезвие', desc: '+15% шанс нанести двойной урон.' }
];

class RNG {
  constructor(seed) {
    this.state = (seed >>> 0) || 0x6d2b79f5;
  }

  next() {
    let x = this.state >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 4294967296;
  }

  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }

  shuffle(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }
}

class SoundEngine {
  constructor(enabled) {
    this.enabled = enabled;
    this.context = null;
  }

  unlock() {
    if (!this.enabled) return;
    if (!this.context) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.context = new AudioCtx();
    }
    if (this.context.state === 'suspended') this.context.resume().catch(() => {});
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) this.unlock();
  }

  tone(frequency, duration = 0.06, type = 'triangle', gain = 0.025, delay = 0, endFrequency = null) {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const amp = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(gain, now + Math.min(0.012, duration / 3));
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(amp).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  play(name) {
    if (!this.enabled) return;
    this.unlock();
    if (!this.context) return;

    switch (name) {
      case 'step':
        this.tone(92, 0.045, 'triangle', 0.018, 0, 72);
        break;
      case 'blocked':
        this.tone(70, 0.055, 'square', 0.012, 0, 52);
        break;
      case 'swing':
        this.tone(190, 0.065, 'sawtooth', 0.018, 0, 95);
        break;
      case 'hit':
        this.tone(120, 0.075, 'square', 0.024, 0, 58);
        break;
      case 'hurt':
        this.tone(84, 0.11, 'sawtooth', 0.025, 0, 42);
        break;
      case 'kill':
        this.tone(118, 0.07, 'triangle', 0.024, 0, 180);
        this.tone(230, 0.09, 'triangle', 0.016, 0.055, 310);
        break;
      case 'stairs':
        this.tone(150, 0.08, 'triangle', 0.022, 0, 185);
        this.tone(220, 0.1, 'triangle', 0.02, 0.08, 285);
        break;
      case 'relic':
        this.tone(180, 0.12, 'sine', 0.018, 0, 270);
        this.tone(360, 0.16, 'sine', 0.012, 0.07, 520);
        break;
      case 'death':
        this.tone(150, 0.38, 'sawtooth', 0.024, 0, 38);
        break;
      case 'victory':
        this.tone(180, 0.14, 'triangle', 0.02, 0, 240);
        this.tone(270, 0.16, 'triangle', 0.02, 0.12, 360);
        this.tone(405, 0.2, 'triangle', 0.018, 0.25, 540);
        break;
      default:
        break;
    }
  }
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is an enhancement; the run remains playable in memory.
  }
}

const settings = { sound: true, ...readJSON(SETTINGS_KEY, {}) };
const audio = new SoundEngine(settings.sound !== false);
let best = {
  bestFloor: 0,
  bestScore: 0,
  bestKills: 0,
  wins: 0,
  runs: 0,
  ...readJSON(BEST_KEY, {})
};

let state = null;
let mode = 'menu';
let pendingRelics = [];
let currentVisible = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(false));
let toastTimer = 0;
let particles = [];
let shakeUntil = 0;
let shakePower = 0;
let lastFrame = performance.now();
let frameRequest = 0;
let pointerStart = null;
let restartIntent = 'menu';
let cachedSavedRun = readSavedRun();

function makeSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const words = new Uint32Array(1);
    globalThis.crypto.getRandomValues(words);
    return words[0] >>> 0;
  }
  return (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
}

function gameRandom() {
  if (!state) return Math.random();
  let x = (state.rng >>> 0) || 0x6d2b79f5;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rng = x >>> 0;
  return state.rng / 4294967296;
}

function gameRandomInt(min, max) {
  return Math.floor(gameRandom() * (max - min + 1)) + min;
}

function vibrate(pattern) {
  if (typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
}

function setOverlay(element, visible) {
  if (visible) {
    element.hidden = false;
    element.classList.add('is-visible');
  } else {
    element.classList.remove('is-visible');
    element.hidden = true;
  }
}

function hideGameOverlays() {
  setOverlay(menuOverlay, false);
  setOverlay(pauseOverlay, false);
  setOverlay(relicOverlay, false);
  setOverlay(endOverlay, false);
  setOverlay(confirmOverlay, false);
}

function showToast(message, duration = 1050) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.add('is-visible');
  toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), duration);
}

function hideHint() {
  swipeHint.classList.add('is-hidden');
  writeJSON(TUTORIAL_KEY, { seen: true });
}

function updateSoundUI() {
  soundButton.textContent = settings.sound ? 'Звук: вкл' : 'Звук: выкл';
  soundButton.setAttribute('aria-pressed', settings.sound ? 'true' : 'false');
}

function updateMenuStats() {
  bestFloor.textContent = best.bestFloor ? `${ROMAN[Math.max(0, best.bestFloor - 1)]} / V` : '—';
  bestScore.textContent = String(best.bestScore || 0);
  cachedSavedRun = readSavedRun();
  continueButton.hidden = !cachedSavedRun;
}

function updateHUD() {
  if (!state) return;
  floorLabel.textContent = `${ROMAN[state.floor - 1]} / V`;
  killsLabel.textContent = String(state.kills);
  healthPips.replaceChildren();
  for (let i = 0; i < state.maxHp; i += 1) {
    const pip = document.createElement('span');
    pip.className = `health-pip${i < state.hp ? ' is-full' : ''}`;
    healthPips.appendChild(pip);
  }
  healthPips.setAttribute('aria-label', `Здоровье ${state.hp} из ${state.maxHp}`);
}

function scoreFor(run = state, won = false) {
  if (!run) return 0;
  return run.kills * 50 + run.floor * 200 + run.relics.length * 100 + run.embers * 20 + (won ? 1000 : 0);
}

function validRunPayload(payload) {
  const s = payload?.state;
  return Boolean(
    payload?.version === SAVE_VERSION &&
    s &&
    Number.isInteger(s.floor) && s.floor >= 1 && s.floor <= FLOOR_COUNT &&
    Number.isFinite(s.hp) && s.hp > 0 &&
    Array.isArray(s.map) && s.map.length === GRID_H &&
    s.map.every((row) => Array.isArray(row) && row.length === GRID_W) &&
    s.player && Number.isInteger(s.player.x) && Number.isInteger(s.player.y) &&
    Array.isArray(s.enemies) && Array.isArray(s.items) && Array.isArray(s.relics)
  );
}

function readSavedRun() {
  const payload = readJSON(SAVE_KEY, null);
  if (!validRunPayload(payload)) {
    if (payload) localStorage.removeItem(SAVE_KEY);
    return null;
  }
  return payload;
}

function saveRun() {
  if (!state || !['playing', 'paused', 'relic'].includes(mode)) return;
  writeJSON(SAVE_KEY, {
    version: SAVE_VERSION,
    mode,
    pendingRelics,
    state
  });
  cachedSavedRun = readSavedRun();
}

function clearRunSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
  cachedSavedRun = null;
}

function createBlankGrid(value = 0) {
  return Array.from({ length: GRID_H }, () => Array(GRID_W).fill(value));
}

function rectsOverlap(a, b, margin = 0) {
  return !(
    a.x + a.w + margin <= b.x - margin ||
    b.x + b.w + margin <= a.x - margin ||
    a.y + a.h + margin <= b.y - margin ||
    b.y + b.h + margin <= a.y - margin
  );
}

function roomCenter(room) {
  return {
    x: Math.floor(room.x + room.w / 2),
    y: Math.floor(room.y + room.h / 2)
  };
}

function carveRoom(map, room) {
  for (let y = room.y; y < room.y + room.h; y += 1) {
    for (let x = room.x; x < room.x + room.w; x += 1) map[y][x] = 1;
  }
}

function carveHorizontal(map, x1, x2, y) {
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x += 1) map[y][x] = 1;
}

function carveVertical(map, y1, y2, x) {
  for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y += 1) map[y][x] = 1;
}

function buildDungeon(floor, seed) {
  const rng = new RNG((seed ^ Math.imul(floor, 0x9e3779b1)) >>> 0);
  const map = createBlankGrid(0);
  const rooms = [];
  const targetRooms = 5 + (floor > 2 ? 1 : 0);

  for (let attempts = 0; attempts < 120 && rooms.length < targetRooms; attempts += 1) {
    const w = rng.int(3, 5);
    const h = rng.int(3, 5);
    const room = {
      x: rng.int(1, Math.max(1, GRID_W - w - 2)),
      y: rng.int(1, Math.max(1, GRID_H - h - 2)),
      w,
      h
    };
    if (rooms.some((existing) => rectsOverlap(room, existing, 1))) continue;
    carveRoom(map, room);
    if (rooms.length) {
      const a = roomCenter(rooms[rooms.length - 1]);
      const b = roomCenter(room);
      if (rng.next() < 0.5) {
        carveHorizontal(map, a.x, b.x, a.y);
        carveVertical(map, a.y, b.y, b.x);
      } else {
        carveVertical(map, a.y, b.y, a.x);
        carveHorizontal(map, a.x, b.x, b.y);
      }
    }
    rooms.push(room);
  }

  if (rooms.length < 3) {
    const fallback = [
      { x: 1, y: 1, w: 4, h: 4 },
      { x: 6, y: 5, w: 4, h: 4 },
      { x: 2, y: 10, w: 5, h: 4 }
    ];
    map.forEach((row) => row.fill(0));
    rooms.splice(0, rooms.length, ...fallback);
    fallback.forEach((room, index) => {
      carveRoom(map, room);
      if (index) {
        const a = roomCenter(fallback[index - 1]);
        const b = roomCenter(room);
        carveVertical(map, a.y, b.y, a.x);
        carveHorizontal(map, a.x, b.x, b.y);
      }
    });
  }

  const start = roomCenter(rooms[0]);
  let farRoom = rooms[rooms.length - 1];
  let farDistance = -1;
  for (const room of rooms.slice(1)) {
    const center = roomCenter(room);
    const distance = Math.abs(center.x - start.x) + Math.abs(center.y - start.y);
    if (distance > farDistance) {
      farDistance = distance;
      farRoom = room;
    }
  }

  return { map, rooms, start, far: roomCenter(farRoom), rng };
}

function cellKey(x, y) {
  return `${x},${y}`;
}

function availableFloorCells(map, excluded) {
  const cells = [];
  for (let y = 1; y < GRID_H - 1; y += 1) {
    for (let x = 1; x < GRID_W - 1; x += 1) {
      if (map[y][x] === 1 && !excluded.has(cellKey(x, y))) cells.push({ x, y });
    }
  }
  return cells;
}

function generateFloor() {
  const dungeon = buildDungeon(state.floor, state.seed);
  state.map = dungeon.map;
  state.player = { x: dungeon.start.x, y: dungeon.start.y };
  state.exit = state.floor < FLOOR_COUNT ? { x: dungeon.far.x, y: dungeon.far.y } : null;
  state.enemies = [];
  state.items = [];
  state.seen = createBlankGrid(false);
  state.trail = [];
  state.ward = state.wardMax;

  const excluded = new Set([cellKey(state.player.x, state.player.y)]);
  if (state.exit) excluded.add(cellKey(state.exit.x, state.exit.y));

  const spawnEnemy = (kind, preferred = null) => {
    let cell = preferred;
    if (!cell || excluded.has(cellKey(cell.x, cell.y))) {
      const choices = availableFloorCells(state.map, excluded).filter((candidate) => (
        Math.abs(candidate.x - state.player.x) + Math.abs(candidate.y - state.player.y) >= 4
      ));
      if (!choices.length) return;
      cell = dungeon.rng.pick(choices);
    }
    excluded.add(cellKey(cell.x, cell.y));
    const data = ENEMY_DATA[kind];
    state.enemies.push({
      id: `${state.floor}-${kind}-${state.enemies.length}-${dungeon.rng.int(100, 999)}`,
      kind,
      x: cell.x,
      y: cell.y,
      hp: data.hp,
      maxHp: data.hp,
      damage: data.damage,
      phase: dungeon.rng.int(0, 1)
    });
  };

  if (state.floor === FLOOR_COUNT) {
    spawnEnemy('boss', dungeon.far);
    const support = 3;
    for (let i = 0; i < support; i += 1) spawnEnemy(i % 2 ? 'shade' : 'gnawer');
  } else {
    const enemyCount = 2 + state.floor;
    for (let i = 0; i < enemyCount; i += 1) {
      let kind = 'gnawer';
      const roll = dungeon.rng.next();
      if (state.floor >= 2 && roll > 0.58) kind = 'shade';
      if (state.floor >= 3 && roll > 0.82) kind = 'guard';
      spawnEnemy(kind);
    }
  }

  const itemCount = state.floor === FLOOR_COUNT ? 1 : (dungeon.rng.next() < 0.5 ? 2 : 1);
  for (let i = 0; i < itemCount; i += 1) {
    const choices = availableFloorCells(state.map, excluded).filter((candidate) => (
      Math.abs(candidate.x - state.player.x) + Math.abs(candidate.y - state.player.y) >= 2
    ));
    if (!choices.length) break;
    const cell = dungeon.rng.pick(choices);
    excluded.add(cellKey(cell.x, cell.y));
    state.items.push({ kind: 'ember', x: cell.x, y: cell.y });
  }

  revealAroundPlayer();
  updateHUD();
}

function newRun() {
  audio.unlock();
  state = {
    seed: makeSeed(),
    rng: makeSeed(),
    floor: 1,
    hp: 6,
    maxHp: 6,
    power: 1,
    vision: 4,
    dodge: 0,
    crit: 0.08,
    wardMax: 0,
    ward: 0,
    spareLives: 0,
    healEvery: 0,
    kills: 0,
    embers: 0,
    turn: 0,
    relics: [],
    map: [],
    player: { x: 0, y: 0 },
    exit: null,
    enemies: [],
    items: [],
    seen: [],
    trail: []
  };
  pendingRelics = [];
  particles = [];
  generateFloor();
  mode = 'playing';
  hideGameOverlays();
  pauseButton.disabled = false;
  saveRun();
  showToast('Этаж I · найди лестницу');
  if (!readJSON(TUTORIAL_KEY, null)?.seen) swipeHint.classList.remove('is-hidden');
}

function restoreRun(payload = cachedSavedRun) {
  if (!validRunPayload(payload)) {
    clearRunSave();
    updateMenuStats();
    showToast('Сохранение повреждено — начинаем чисто');
    return;
  }
  audio.unlock();
  state = payload.state;
  state.trail = Array.isArray(state.trail) ? state.trail : [];
  state.seen = Array.isArray(state.seen) && state.seen.length === GRID_H ? state.seen : createBlankGrid(false);
  pendingRelics = Array.isArray(payload.pendingRelics) ? payload.pendingRelics : [];
  mode = ['playing', 'paused', 'relic'].includes(payload.mode) ? payload.mode : 'playing';
  revealAroundPlayer();
  updateHUD();
  hideGameOverlays();
  if (mode === 'paused') {
    showPauseOverlay();
  } else if (mode === 'relic') {
    showRelicOverlay();
  }
  pauseButton.disabled = mode !== 'playing';
  showToast(`Этаж ${ROMAN[state.floor - 1]} · забег восстановлен`);
}

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
}

function isFloor(x, y) {
  return inBounds(x, y) && state.map[y][x] === 1;
}

function enemyAt(x, y, exceptId = null) {
  return state.enemies.find((enemy) => enemy.id !== exceptId && enemy.x === x && enemy.y === y) || null;
}

function itemAt(x, y) {
  return state.items.find((item) => item.x === x && item.y === y) || null;
}

function lineClear(x0, y0, x1, y1) {
  let dx = Math.abs(x1 - x0);
  let sx = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0);
  let sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  let x = x0;
  let y = y0;

  while (true) {
    if (x === x1 && y === y1) return true;
    const e2 = 2 * error;
    if (e2 >= dy) { error += dy; x += sx; }
    if (e2 <= dx) { error += dx; y += sy; }
    if (x === x1 && y === y1) return true;
    if (!inBounds(x, y) || state.map[y][x] === 0) return false;
  }
}

function revealAroundPlayer() {
  currentVisible = createBlankGrid(false);
  if (!state) return;
  const radius = state.vision;
  for (let y = 0; y < GRID_H; y += 1) {
    for (let x = 0; x < GRID_W; x += 1) {
      const dx = x - state.player.x;
      const dy = y - state.player.y;
      if (dx * dx + dy * dy > radius * radius) continue;
      if (!lineClear(state.player.x, state.player.y, x, y)) continue;
      currentVisible[y][x] = true;
      state.seen[y][x] = true;
    }
  }
}

function spawnBurst(x, y, count = 6, type = 'ink') {
  const color = type === 'ember' ? '#d47a46' : type === 'paper' ? '#e7ddc4' : '#272923';
  for (let i = 0; i < count; i += 1) {
    const angle = gameRandom() * TAU;
    const speed = 0.4 + gameRandom() * 1.3;
    particles.push({
      x: x + 0.5,
      y: y + 0.5,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 240 + gameRandom() * 260,
      maxLife: 500,
      color,
      size: 0.04 + gameRandom() * 0.08
    });
  }
}

function shake(power = 2, duration = 100) {
  if (REDUCED_MOTION) return;
  shakePower = Math.max(shakePower, power);
  shakeUntil = Math.max(shakeUntil, performance.now() + duration);
}

function pickupItem(item) {
  const index = state.items.indexOf(item);
  if (index >= 0) state.items.splice(index, 1);
  state.embers += 1;
  if (state.hp < state.maxHp) {
    state.hp += 1;
    showToast('Тёплый воск · +1 жизнь');
  } else {
    showToast('Тёплый воск · +20 к счёту');
  }
  audio.play('relic');
  spawnBurst(item.x, item.y, 8, 'ember');
  vibrate(12);
  updateHUD();
}

function handleDirection(name) {
  if (mode !== 'playing' || !state) return;
  const direction = DIRS[name];
  if (!direction) return;
  hideHint();
  audio.unlock();

  const nx = state.player.x + direction.x;
  const ny = state.player.y + direction.y;

  if (!isFloor(nx, ny)) {
    audio.play('blocked');
    shake(1, 65);
    showToast('Камень не уступает', 650);
    return;
  }

  const target = enemyAt(nx, ny);
  state.turn += 1;

  if (target) {
    playerAttack(target);
    if (mode !== 'playing') return;
    enemyTurn();
  } else {
    state.trail.push({ x: state.player.x, y: state.player.y });
    if (state.trail.length > 10) state.trail.shift();
    state.player.x = nx;
    state.player.y = ny;
    audio.play('step');
    spawnBurst(nx, ny, 2, 'paper');

    const item = itemAt(nx, ny);
    if (item) pickupItem(item);
    revealAroundPlayer();

    if (state.exit && nx === state.exit.x && ny === state.exit.y) {
      audio.play('stairs');
      vibrate([12, 30, 18]);
      openRelicChoice();
      return;
    }

    enemyTurn();
  }

  if (mode === 'playing') {
    revealAroundPlayer();
    updateHUD();
    saveRun();
  }
}

function waitTurn() {
  if (mode !== 'playing' || !state) return;
  hideHint();
  audio.unlock();
  state.turn += 1;
  showToast('Ты ждёшь', 500);
  enemyTurn();
  if (mode === 'playing') {
    revealAroundPlayer();
    updateHUD();
    saveRun();
  }
}

function playerAttack(enemy) {
  audio.play('swing');
  let damage = state.power;
  const critical = gameRandom() < state.crit;
  if (critical) damage *= 2;
  enemy.hp -= damage;
  spawnBurst(enemy.x, enemy.y, critical ? 11 : 7, 'ink');
  shake(critical ? 3 : 1.8, critical ? 120 : 80);
  vibrate(critical ? [12, 20, 16] : 12);

  if (enemy.hp <= 0) {
    const killedKind = enemy.kind;
    state.enemies = state.enemies.filter((candidate) => candidate.id !== enemy.id);
    state.kills += 1;
    audio.play('kill');
    showToast(critical ? `Критический удар · ${damage}` : `${ENEMY_DATA[killedKind].name} повержен`, 760);

    if (state.healEvery && state.kills % state.healEvery === 0 && state.hp < state.maxHp) {
      state.hp += 1;
      showToast('Красный воск · +1 жизнь', 900);
    }

    if (killedKind === 'boss') {
      finishRun(true);
      return;
    }
  } else {
    audio.play('hit');
    showToast(critical ? `Критический удар · ${damage}` : `Удар · ${damage}`, 620);
  }
  updateHUD();
}

function canEnemyMoveTo(enemy, x, y) {
  if (!isFloor(x, y)) return false;
  if (x === state.player.x && y === state.player.y) return false;
  return !enemyAt(x, y, enemy.id);
}

function enemyDistance(enemy) {
  return Math.abs(enemy.x - state.player.x) + Math.abs(enemy.y - state.player.y);
}

function enemyCanSeePlayer(enemy, range = 8) {
  const dx = enemy.x - state.player.x;
  const dy = enemy.y - state.player.y;
  if (dx * dx + dy * dy > range * range) return false;
  return lineClear(enemy.x, enemy.y, state.player.x, state.player.y);
}

function moveEnemy(enemy) {
  const dx = state.player.x - enemy.x;
  const dy = state.player.y - enemy.y;
  const chasing = enemy.kind === 'boss' || enemyCanSeePlayer(enemy, enemy.kind === 'guard' ? 7 : 8);
  let candidates;

  if (chasing) {
    candidates = [];
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx) candidates.push({ x: Math.sign(dx), y: 0 });
      if (dy) candidates.push({ x: 0, y: Math.sign(dy) });
    } else {
      if (dy) candidates.push({ x: 0, y: Math.sign(dy) });
      if (dx) candidates.push({ x: Math.sign(dx), y: 0 });
    }
    candidates.push({ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 });
  } else {
    candidates = [
      { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }
    ];
    for (let i = candidates.length - 1; i > 0; i -= 1) {
      const j = gameRandomInt(0, i);
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    if (gameRandom() < 0.45) return;
  }

  const seen = new Set();
  for (const step of candidates) {
    const key = `${step.x},${step.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const nx = enemy.x + step.x;
    const ny = enemy.y + step.y;
    if (!canEnemyMoveTo(enemy, nx, ny)) continue;
    enemy.x = nx;
    enemy.y = ny;
    return;
  }
}

function takeDamage(amount, sourceName) {
  if (gameRandom() < state.dodge) {
    showToast(`${sourceName}: мимо`, 700);
    spawnBurst(state.player.x, state.player.y, 5, 'paper');
    vibrate(8);
    return;
  }

  let actual = amount;
  if (state.ward > 0) {
    actual = Math.max(0, actual - 1);
    state.ward -= 1;
    showToast(actual ? `Фитиль смягчил удар · -${actual}` : 'Фитиль принял удар', 760);
  }

  if (actual > 0) {
    state.hp -= actual;
    audio.play('hurt');
    spawnBurst(state.player.x, state.player.y, 10, 'ember');
    shake(4, 140);
    vibrate([18, 26, 22]);
    if (state.ward === 0) showToast(`${sourceName} · -${actual} жизнь`, 760);
  }

  if (state.hp <= 0) {
    if (state.spareLives > 0) {
      state.spareLives -= 1;
      state.hp = 1;
      showToast('Последняя искра не дала погаснуть', 1200);
      audio.play('relic');
      shake(3, 180);
    } else {
      updateHUD();
      finishRun(false);
      return false;
    }
  }
  updateHUD();
  return true;
}

function enemyTurn() {
  if (mode !== 'playing') return;
  const enemies = [...state.enemies];
  for (const enemy of enemies) {
    if (mode !== 'playing' || !state.enemies.some((candidate) => candidate.id === enemy.id)) break;

    if (enemy.kind === 'guard' && (state.turn + enemy.phase) % 2 === 0) continue;

    const distance = enemyDistance(enemy);
    if (distance === 1) {
      if (!takeDamage(enemy.damage, ENEMY_DATA[enemy.kind].name)) return;
      continue;
    }

    const aligned = enemy.x === state.player.x || enemy.y === state.player.y;
    if (
      enemy.kind === 'shade' &&
      aligned &&
      distance <= 4 &&
      lineClear(enemy.x, enemy.y, state.player.x, state.player.y) &&
      (state.turn + enemy.phase) % 2 === 1
    ) {
      spawnBurst(state.player.x, state.player.y, 6, 'ink');
      if (!takeDamage(1, 'Тень')) return;
      continue;
    }

    if (enemy.kind === 'boss' && aligned && distance === 2 && lineClear(enemy.x, enemy.y, state.player.x, state.player.y)) {
      showToast('Страж Пепла бьёт через клетку', 700);
      if (!takeDamage(1, 'Страж Пепла')) return;
      continue;
    }

    moveEnemy(enemy);
  }
}

function chooseRelicOptions() {
  const owned = new Set(state.relics);
  let pool = RELICS.filter((relic) => !owned.has(relic.id));
  if (pool.length < 3) pool = [...RELICS];
  const rng = new RNG((state.seed ^ Math.imul(state.floor + 91, 0x85ebca6b) ^ state.turn) >>> 0);
  return rng.shuffle([...pool]).slice(0, 3).map((relic) => relic.id);
}

function openRelicChoice() {
  mode = 'relic';
  pauseButton.disabled = true;
  pendingRelics = chooseRelicOptions();
  saveRun();
  showRelicOverlay();
}

function showRelicOverlay() {
  relicList.replaceChildren();
  const options = pendingRelics.length ? pendingRelics : chooseRelicOptions();
  pendingRelics = options;
  for (const id of options) {
    const relic = RELICS.find((candidate) => candidate.id === id);
    if (!relic) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'relic-choice';
    button.dataset.relic = relic.id;
    button.setAttribute('data-native-press', '');
    button.innerHTML = `
      <span class="relic-rune" aria-hidden="true"><span>${relic.rune}</span></span>
      <span class="relic-copy"><strong>${relic.name}</strong><small>${relic.desc}</small></span>
    `;
    relicList.appendChild(button);
  }
  setOverlay(relicOverlay, true);
}

function applyRelic(id) {
  switch (id) {
    case 'heart':
      state.maxHp += 2;
      state.hp = Math.min(state.maxHp, state.hp + 2);
      break;
    case 'blade':
      state.power += 1;
      break;
    case 'eye':
      state.vision += 1;
      break;
    case 'ward':
      state.wardMax += 1;
      break;
    case 'feather':
      state.dodge = Math.min(0.36, state.dodge + 0.12);
      break;
    case 'blood':
      state.healEvery = 4;
      break;
    case 'spark':
      state.spareLives += 1;
      break;
    case 'crit':
      state.crit = Math.min(0.53, state.crit + 0.15);
      break;
    default:
      return;
  }
  if (!state.relics.includes(id)) state.relics.push(id);
}

function chooseRelic(id) {
  if (mode !== 'relic' || !pendingRelics.includes(id)) return;
  const relic = RELICS.find((candidate) => candidate.id === id);
  applyRelic(id);
  audio.play('relic');
  vibrate([10, 25, 16]);
  state.floor += 1;
  generateFloor();
  mode = 'playing';
  pendingRelics = [];
  setOverlay(relicOverlay, false);
  pauseButton.disabled = false;
  saveRun();
  showToast(`${relic?.name || 'Реликвия'} · этаж ${ROMAN[state.floor - 1]}`, 1100);
}

function showPauseOverlay() {
  pauseSummary.textContent = `Этаж ${ROMAN[state.floor - 1]} / V · ${state.kills} убито · ${state.relics.length} реликвий`;
  setOverlay(pauseOverlay, true);
}

function pauseGame() {
  if (mode !== 'playing' || !state) return;
  mode = 'paused';
  saveRun();
  pauseButton.disabled = true;
  showPauseOverlay();
}

function resumeGame() {
  if (mode !== 'paused') return;
  mode = 'playing';
  setOverlay(pauseOverlay, false);
  pauseButton.disabled = false;
  saveRun();
}

function requestRestart(source) {
  restartIntent = source;
  setOverlay(confirmOverlay, true);
}

function cancelRestart() {
  setOverlay(confirmOverlay, false);
}

function confirmRestart() {
  setOverlay(confirmOverlay, false);
  if (restartIntent === 'pause') setOverlay(pauseOverlay, false);
  if (restartIntent === 'menu') setOverlay(menuOverlay, false);
  newRun();
}

function finishRun(won) {
  if (!state) return;
  const score = scoreFor(state, won);
  mode = won ? 'victory' : 'dead';
  clearRunSave();
  best.runs += 1;
  if (won) best.wins += 1;
  best.bestFloor = Math.max(best.bestFloor, state.floor);
  best.bestKills = Math.max(best.bestKills, state.kills);
  best.bestScore = Math.max(best.bestScore, score);
  writeJSON(BEST_KEY, best);
  updateMenuStats();
  pauseButton.disabled = true;

  if (won) {
    audio.play('victory');
    vibrate([18, 40, 18, 40, 30]);
    endEyebrow.textContent = 'Забег завершён';
    endTitle.textContent = 'Страж погас';
    endCopy.textContent = 'Ты дошёл до самого низа и вынес огонь обратно наверх.';
  } else {
    audio.play('death');
    vibrate([35, 45, 60]);
    endEyebrow.textContent = 'Забег окончен';
    endTitle.textContent = 'Погас';
    endCopy.textContent = `На этаже ${ROMAN[state.floor - 1]} тьма оказалась быстрее.`;
  }

  resultGrid.innerHTML = `
    <span><strong>${ROMAN[state.floor - 1]}</strong>этаж</span>
    <span><strong>${state.kills}</strong>убито</span>
    <span><strong>${score}</strong>счёт</span>
  `;
  setOverlay(endOverlay, true);
}

function hash01(x, y, salt = 0) {
  let n = Math.imul(x + 11, 374761393) ^ Math.imul(y + 17, 668265263) ^ Math.imul(salt + 23, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width: rect.width, height: rect.height };
}

function drawFloorCell(x, y, px, py, cw, ch, visible, seen) {
  const noise = hash01(x, y, state?.floor || 0);
  ctx.fillStyle = visible ? (noise > 0.5 ? '#d9cbaa' : '#d4c5a2') : '#746d5d';
  ctx.fillRect(px, py, cw + 0.5, ch + 0.5);

  ctx.globalAlpha = visible ? 0.11 : 0.08;
  ctx.strokeStyle = '#272923';
  ctx.lineWidth = 0.7;
  const offset = 4 + noise * 8;
  ctx.beginPath();
  ctx.moveTo(px + offset, py + ch * 0.2);
  ctx.lineTo(px + Math.min(cw - 3, offset + cw * 0.28), py + ch * 0.2);
  ctx.moveTo(px + cw * 0.62, py + ch * 0.72);
  ctx.lineTo(px + cw * 0.82, py + ch * 0.72);
  ctx.stroke();
  ctx.globalAlpha = seen ? 1 : 0;
}

function drawWallCell(x, y, px, py, cw, ch, visible) {
  ctx.fillStyle = visible ? '#35372f' : '#292b26';
  ctx.fillRect(px, py, cw + 0.5, ch + 0.5);
  const noise = hash01(x, y, 71);
  ctx.globalAlpha = visible ? 0.18 : 0.1;
  ctx.strokeStyle = '#e7ddc4';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(px + cw * noise, py + 3);
  ctx.lineTo(px + Math.min(cw - 2, cw * noise + cw * 0.24), py + 3);
  ctx.moveTo(px + 3, py + ch * (0.35 + noise * 0.3));
  ctx.lineTo(px + cw * 0.25, py + ch * (0.35 + noise * 0.3));
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawStairs(x, y, cw, ch, dimmed = false) {
  const cx = (x + 0.5) * cw;
  const cy = (y + 0.5) * ch;
  ctx.save();
  ctx.globalAlpha = dimmed ? 0.35 : 0.9;
  ctx.strokeStyle = '#272923';
  ctx.lineWidth = Math.max(1.5, cw * 0.055);
  for (let i = -1; i <= 1; i += 1) {
    const yy = cy + i * ch * 0.17;
    ctx.beginPath();
    ctx.moveTo(cx - cw * (0.25 - i * 0.03), yy);
    ctx.lineTo(cx + cw * (0.25 + i * 0.03), yy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEmber(item, cw, ch, time) {
  const cx = (item.x + 0.5) * cw;
  const cy = (item.y + 0.52) * ch;
  const flicker = REDUCED_MOTION ? 0 : Math.sin(time * 0.012 + item.x) * 0.05;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#b75c36';
  ctx.beginPath();
  ctx.moveTo(0, -ch * (0.2 + flicker));
  ctx.quadraticCurveTo(cw * 0.19, -ch * 0.01, 0, ch * 0.18);
  ctx.quadraticCurveTo(-cw * 0.19, -ch * 0.01, 0, -ch * (0.2 + flicker));
  ctx.fill();
  ctx.restore();
}

function drawEnemy(enemy, cw, ch) {
  const cx = (enemy.x + 0.5) * cw;
  const cy = (enemy.y + 0.53) * ch;
  const size = Math.min(cw, ch);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#272923';
  ctx.strokeStyle = '#272923';
  ctx.lineWidth = Math.max(1.2, size * 0.045);

  if (enemy.kind === 'gnawer') {
    ctx.beginPath();
    ctx.moveTo(-size * 0.28, size * 0.12);
    ctx.quadraticCurveTo(0, -size * 0.26, size * 0.28, size * 0.12);
    ctx.quadraticCurveTo(0, size * 0.28, -size * 0.28, size * 0.12);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-size * 0.18, -size * 0.12);
    ctx.lineTo(-size * 0.1, -size * 0.3);
    ctx.lineTo(-size * 0.02, -size * 0.12);
    ctx.moveTo(size * 0.18, -size * 0.12);
    ctx.lineTo(size * 0.1, -size * 0.3);
    ctx.lineTo(size * 0.02, -size * 0.12);
    ctx.fill();
  } else if (enemy.kind === 'shade') {
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.25, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.09, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-size * 0.3, size * 0.28);
    ctx.quadraticCurveTo(0, size * 0.06, size * 0.3, size * 0.28);
    ctx.stroke();
  } else {
    const boss = enemy.kind === 'boss';
    const w = boss ? size * 0.52 : size * 0.45;
    const h = boss ? size * 0.58 : size * 0.5;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.fillRect(-w * 0.32, -h * 0.08, w * 0.64, h * 0.12);
    if (boss) {
      ctx.beginPath();
      ctx.moveTo(-w * 0.45, -h * 0.5);
      ctx.lineTo(-w * 0.22, -h * 0.78);
      ctx.lineTo(0, -h * 0.52);
      ctx.lineTo(w * 0.22, -h * 0.78);
      ctx.lineTo(w * 0.45, -h * 0.5);
      ctx.stroke();
    }
  }

  if (enemy.maxHp > 1 && enemy.hp < enemy.maxHp) {
    const width = size * 0.55;
    ctx.fillStyle = 'rgba(39,41,35,.25)';
    ctx.fillRect(-width / 2, size * 0.36, width, 3);
    ctx.fillStyle = '#b75c36';
    ctx.fillRect(-width / 2, size * 0.36, width * (enemy.hp / enemy.maxHp), 3);
  }
  ctx.restore();
}

function drawPlayer(cw, ch, time) {
  const cx = (state.player.x + 0.5) * cw;
  const cy = (state.player.y + 0.55) * ch;
  const size = Math.min(cw, ch);
  const flicker = REDUCED_MOTION ? 0 : Math.sin(time * 0.016) * size * 0.025;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#272923';
  ctx.fillRect(-size * 0.12, -size * 0.02, size * 0.24, size * 0.34);
  ctx.strokeStyle = '#272923';
  ctx.lineWidth = Math.max(1.2, size * 0.045);
  ctx.beginPath();
  ctx.arc(0, size * 0.08, size * 0.27, 0, TAU);
  ctx.stroke();

  ctx.fillStyle = '#b75c36';
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.38 - flicker);
  ctx.quadraticCurveTo(size * 0.22, -size * 0.16, 0, size * 0.01);
  ctx.quadraticCurveTo(-size * 0.22, -size * 0.16, 0, -size * 0.38 - flicker);
  ctx.fill();
  ctx.restore();
}

function drawTrail(cw, ch) {
  if (!state.trail?.length) return;
  ctx.save();
  ctx.fillStyle = '#272923';
  state.trail.forEach((step, index) => {
    const alpha = ((index + 1) / state.trail.length) * 0.09;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc((step.x + 0.5) * cw, (step.y + 0.56) * ch, Math.min(cw, ch) * 0.09, 0, TAU);
    ctx.fill();
  });
  ctx.restore();
}

function drawParticles(cw, ch) {
  ctx.save();
  for (const particle of particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, particle.life / particle.maxLife));
    ctx.fillStyle = particle.color;
    ctx.fillRect(
      particle.x * cw - particle.size * cw / 2,
      particle.y * ch - particle.size * ch / 2,
      Math.max(1.5, particle.size * cw),
      Math.max(1.5, particle.size * ch)
    );
  }
  ctx.restore();
}

function drawGame(time) {
  const size = resizeCanvas();
  ctx.save();
  ctx.fillStyle = '#20221e';
  ctx.fillRect(0, 0, size.width, size.height);

  if (!state || !state.map.length) {
    ctx.restore();
    return;
  }

  const cw = size.width / GRID_W;
  const ch = size.height / GRID_H;
  let sx = 0;
  let sy = 0;
  if (performance.now() < shakeUntil) {
    sx = (Math.random() - 0.5) * shakePower * 2;
    sy = (Math.random() - 0.5) * shakePower * 2;
  } else {
    shakePower = 0;
  }
  ctx.translate(sx, sy);

  for (let y = 0; y < GRID_H; y += 1) {
    for (let x = 0; x < GRID_W; x += 1) {
      const px = x * cw;
      const py = y * ch;
      const seen = Boolean(state.seen?.[y]?.[x]);
      const visible = Boolean(currentVisible?.[y]?.[x]);
      if (!seen) {
        ctx.fillStyle = '#20221e';
        ctx.fillRect(px, py, cw + 1, ch + 1);
        continue;
      }
      if (state.map[y][x] === 1) drawFloorCell(x, y, px, py, cw, ch, visible, seen);
      else drawWallCell(x, y, px, py, cw, ch, visible);
    }
  }

  drawTrail(cw, ch);

  if (state.exit && state.seen[state.exit.y][state.exit.x]) {
    drawStairs(state.exit.x, state.exit.y, cw, ch, !currentVisible[state.exit.y][state.exit.x]);
  }

  for (const item of state.items) {
    if (currentVisible[item.y]?.[item.x]) drawEmber(item, cw, ch, time);
  }

  for (const enemy of state.enemies) {
    if (currentVisible[enemy.y]?.[enemy.x]) drawEnemy(enemy, cw, ch);
  }

  drawPlayer(cw, ch, time);
  drawParticles(cw, ch);
  ctx.restore();
}

function updateParticles(dt) {
  if (!particles.length) return;
  for (const particle of particles) {
    particle.x += particle.vx * dt / 1000;
    particle.y += particle.vy * dt / 1000;
    particle.vy += 0.7 * dt / 1000;
    particle.life -= dt;
  }
  particles = particles.filter((particle) => particle.life > 0);
}

function frame(time) {
  const dt = Math.min(40, time - lastFrame);
  lastFrame = time;
  if (!document.hidden) {
    updateParticles(dt);
    drawGame(time);
    frameRequest = requestAnimationFrame(frame);
  }
}

function startFrameLoop() {
  cancelAnimationFrame(frameRequest);
  lastFrame = performance.now();
  frameRequest = requestAnimationFrame(frame);
}

function handleSwipeStart(event) {
  if (mode !== 'playing') return;
  pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
  playfield.setPointerCapture?.(event.pointerId);
}

function handleSwipeEnd(event) {
  if (!pointerStart || pointerStart.id !== event.pointerId || mode !== 'playing') {
    pointerStart = null;
    return;
  }
  const dx = event.clientX - pointerStart.x;
  const dy = event.clientY - pointerStart.y;
  pointerStart = null;
  if (Math.hypot(dx, dy) < 18) return;
  if (Math.abs(dx) > Math.abs(dy)) handleDirection(dx > 0 ? 'right' : 'left');
  else handleDirection(dy > 0 ? 'down' : 'up');
}

function setupInput() {
  document.querySelectorAll('[data-dir]').forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      handleDirection(button.dataset.dir);
    });
  });

  waitButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    waitTurn();
  });

  playfield.addEventListener('pointerdown', handleSwipeStart);
  playfield.addEventListener('pointerup', handleSwipeEnd);
  playfield.addEventListener('pointercancel', () => { pointerStart = null; });
  playfield.addEventListener('lostpointercapture', () => { pointerStart = null; });

  window.addEventListener('keydown', (event) => {
    const keyMap = {
      ArrowUp: 'up', w: 'up', W: 'up',
      ArrowDown: 'down', s: 'down', S: 'down',
      ArrowLeft: 'left', a: 'left', A: 'left',
      ArrowRight: 'right', d: 'right', D: 'right'
    };
    const direction = keyMap[event.key];
    if (direction) {
      event.preventDefault();
      handleDirection(direction);
    } else if (event.key === ' ' && mode === 'playing') {
      event.preventDefault();
      waitTurn();
    } else if (event.key === 'Escape' && mode === 'playing') {
      event.preventDefault();
      pauseGame();
    }
  });
}

pauseButton.addEventListener('click', pauseGame);
resumeButton.addEventListener('click', resumeGame);
continueButton.addEventListener('click', () => restoreRun(cachedSavedRun));
newRunButton.addEventListener('click', () => {
  audio.unlock();
  if (cachedSavedRun) requestRestart('menu');
  else newRun();
});
restartButton.addEventListener('click', () => requestRestart('pause'));
againButton.addEventListener('click', newRun);
cancelRestartButton.addEventListener('click', cancelRestart);
confirmRestartButton.addEventListener('click', confirmRestart);

relicList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-relic]');
  if (button) chooseRelic(button.dataset.relic);
});

soundButton.addEventListener('click', () => {
  settings.sound = !settings.sound;
  writeJSON(SETTINGS_KEY, settings);
  audio.setEnabled(settings.sound);
  updateSoundUI();
  if (settings.sound) audio.play('step');
});

window.addEventListener('resize', () => drawGame(performance.now()));
window.addEventListener('orientationchange', () => setTimeout(() => drawGame(performance.now()), 80));

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(frameRequest);
    if (state && ['playing', 'paused', 'relic'].includes(mode)) saveRun();
  } else {
    startFrameLoop();
  }
});

window.addEventListener('pagehide', () => {
  if (state && ['playing', 'paused', 'relic'].includes(mode)) saveRun();
});

setupInput();
updateSoundUI();
updateMenuStats();
if (readJSON(TUTORIAL_KEY, null)?.seen) swipeHint.classList.add('is-hidden');
pauseButton.disabled = true;
startFrameLoop();
