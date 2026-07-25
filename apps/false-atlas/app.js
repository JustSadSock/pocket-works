const STORAGE_KEY = 'pocket-works:false-atlas:save';
const APP_VERSION = '1.0.0';
const TOTAL_ROUNDS = 6;
const MAX_LIVES = 3;
const MAX_LENSES = 3;

const CITY_DATA = [
  { id: 'alba', name: 'АЛЬБА', x: 0.22, y: 0.22, value: 3 },
  { id: 'vel', name: 'ВЕЛЬ', x: 0.67, y: 0.18, value: 5 },
  { id: 'runa', name: 'РУНА', x: 0.48, y: 0.43, value: 4 },
  { id: 'siver', name: 'СИВЕР', x: 0.79, y: 0.61, value: 4 },
  { id: 'krai', name: 'КРАЙ', x: 0.23, y: 0.73, value: 2 },
  { id: 'dvor', name: 'ДВОР', x: 0.57, y: 0.82, value: 5 }
];

const SOURCE_DATA = {
  scout: { color: '#4f5b48', pale: '#8c9b82', label: 'Следопыт', bias: 0.74 },
  merchant: { color: '#8a622f', pale: '#c3914b', label: 'Купец', bias: 0.57 },
  bell: { color: '#665364', pale: '#9c8298', label: 'Звонарь', bias: 0.46 }
};

const SOURCE_KEYS = Object.keys(SOURCE_DATA);
const ROAD_LINKS = [[0, 2], [1, 2], [1, 3], [2, 3], [2, 4], [2, 5], [3, 5], [4, 5]];
const REGION_POLYGONS = [
  [[0.04, 0.05], [0.38, 0.02], [0.42, 0.31], [0.27, 0.42], [0.04, 0.35]],
  [[0.38, 0.02], [0.96, 0.05], [0.94, 0.37], [0.63, 0.42], [0.42, 0.31]],
  [[0.04, 0.35], [0.27, 0.42], [0.43, 0.65], [0.36, 0.96], [0.03, 0.94]],
  [[0.27, 0.42], [0.42, 0.31], [0.63, 0.42], [0.67, 0.72], [0.43, 0.65]],
  [[0.63, 0.42], [0.94, 0.37], [0.98, 0.95], [0.62, 0.97], [0.67, 0.72]],
  [[0.43, 0.65], [0.67, 0.72], [0.62, 0.97], [0.36, 0.96]]
];
const TERRAIN_MARKS = [
  { type: 'mountain', x: .12, y: .13, s: .8 }, { type: 'mountain', x: .15, y: .16, s: .6 },
  { type: 'mountain', x: .84, y: .16, s: .7 }, { type: 'mountain', x: .87, y: .21, s: .55 },
  { type: 'tree', x: .14, y: .53, s: .8 }, { type: 'tree', x: .18, y: .57, s: .55 },
  { type: 'tree', x: .31, y: .60, s: .7 }, { type: 'tree', x: .72, y: .39, s: .65 },
  { type: 'tree', x: .76, y: .42, s: .5 }, { type: 'tree', x: .85, y: .82, s: .7 },
  { type: 'hill', x: .38, y: .15, s: .9 }, { type: 'hill', x: .68, y: .91, s: .8 },
  { type: 'hill', x: .12, y: .88, s: .65 }
];

const dom = {
  shell: document.querySelector('.atlas-shell'), mapFrame: document.getElementById('map-frame'),
  mapPaper: document.getElementById('map-paper'), canvas: document.getElementById('map-canvas'),
  cityLayer: document.getElementById('city-layer'), dropHalo: document.getElementById('drop-halo'),
  truthFlash: document.getElementById('truth-flash'), sourceDock: document.getElementById('source-dock'),
  sourceButtons: [...document.querySelectorAll('.source-seal')], lensTool: document.getElementById('lens-tool'),
  shieldTool: document.getElementById('shield-tool'), lensCount: document.getElementById('lens-count'),
  commitSeal: document.getElementById('commit-seal'), bannerLives: document.getElementById('banner-lives'),
  nightTrack: document.getElementById('night-track'), soundButton: document.getElementById('sound-button'),
  introScreen: document.getElementById('intro-screen'), startButton: document.getElementById('start-button'),
  startLabel: document.getElementById('start-label'), newCampaignButton: document.getElementById('new-campaign-button'),
  resultScreen: document.getElementById('result-screen'), resultTitle: document.getElementById('result-title'),
  resultEmblem: document.getElementById('result-emblem'), resultScore: document.getElementById('result-score'),
  resultButton: document.getElementById('result-button'), toast: document.getElementById('toast'),
  gestureLesson: document.getElementById('gesture-lesson'), lessonToken: document.getElementById('lesson-token'),
  lessonTarget: document.getElementById('lesson-target')
};

const ctx = dom.canvas.getContext('2d', { alpha: true, desynchronized: true });
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let canvasSize = { width: 1, height: 1, dpr: 1 };
let state = createInitialState();
let animationFrame = 0;
let attackAnimation = null;
let toastTimer = 0;
let lessonTimer = 0;
let activeDrag = null;
let armedTool = null;
let audioContext = null;
let resizeObserver = null;

function createInitialState() {
  return { active: false, seed: 0, campaign: [], round: 0, lives: MAX_LIVES, lenses: MAX_LENSES,
    score: 0, phase: 'idle', shieldCity: null, verifiedCities: [], visibleSources: [...SOURCE_KEYS],
    history: Object.fromEntries(SOURCE_KEYS.map((key) => [key, []])), scorchedCities: [], best: 0,
    soundEnabled: true, hasUsedLens: false };
}

function safeParse(value) { try { return JSON.parse(value); } catch { return null; } }

function loadState() {
  const saved = safeParse(localStorage.getItem(STORAGE_KEY));
  if (!saved || typeof saved !== 'object') return;
  const fresh = createInitialState();
  state = { ...fresh, ...saved, phase: saved.active ? 'planning' : 'idle',
    visibleSources: SOURCE_KEYS.filter((key) => saved.visibleSources?.includes(key)),
    verifiedCities: Array.isArray(saved.verifiedCities) ? saved.verifiedCities.filter(isCityIndex) : [],
    scorchedCities: Array.isArray(saved.scorchedCities) ? saved.scorchedCities.filter(isCityIndex) : [],
    history: normalizeHistory(saved.history) };
  if (!state.visibleSources.length) state.visibleSources = [...SOURCE_KEYS];
  if (!Array.isArray(state.campaign) || state.campaign.length !== TOTAL_ROUNDS) {
    state.seed = Number.isInteger(state.seed) ? state.seed : createSeed();
    state.campaign = generateCampaign(state.seed);
  }
  if (!Number.isInteger(state.round) || state.round < 0 || state.round >= TOTAL_ROUNDS) { state.active = false; state.round = 0; }
  state.lives = clampInt(state.lives, 0, MAX_LIVES, MAX_LIVES);
  state.lenses = clampInt(state.lenses, 0, MAX_LENSES, MAX_LENSES);
  state.score = clampInt(state.score, 0, TOTAL_ROUNDS, 0);
  state.best = clampInt(state.best, 0, TOTAL_ROUNDS, 0);
  state.shieldCity = isCityIndex(state.shieldCity) ? state.shieldCity : null;
  state.soundEnabled = state.soundEnabled !== false;
}

function normalizeHistory(history) {
  const normalized = {};
  for (const key of SOURCE_KEYS) {
    const entries = Array.isArray(history?.[key]) ? history[key] : [];
    normalized[key] = entries.slice(0, TOTAL_ROUNDS).map(Boolean);
  }
  return normalized;
}

function saveState() {
  const serializable = { active: state.active, seed: state.seed, campaign: state.campaign, round: state.round,
    lives: state.lives, lenses: state.lenses, score: state.score, shieldCity: state.shieldCity,
    verifiedCities: state.verifiedCities, visibleSources: state.visibleSources, history: state.history,
    scorchedCities: state.scorchedCities, best: state.best, soundEnabled: state.soundEnabled,
    hasUsedLens: state.hasUsedLens, version: APP_VERSION };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable)); }
  catch { showToast('Сохранение недоступно'); }
}

function isCityIndex(value) { return Number.isInteger(value) && value >= 0 && value < CITY_DATA.length; }
function clampInt(value, min, max, fallback) { return Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback; }
function createSeed() {
  const values = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values);
  else values[0] = Math.floor(Math.random() * 0xffffffff);
  return values[0] || 0x5f3759df;
}
function mulberry32(seed) { return function random() { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function pickDifferentCity(random, target, excluded = []) {
  const choices = CITY_DATA.map((_, index) => index).filter((index) => index !== target && !excluded.includes(index));
  return choices[Math.floor(random() * choices.length)] ?? ((target + 1) % CITY_DATA.length);
}
function weightedMerchantDecoy(random, target) {
  const candidates = CITY_DATA.map((city, index) => ({ index, weight: city.value + random() * 2 }))
    .filter((entry) => entry.index !== target).sort((a, b) => b.weight - a.weight);
  return candidates[0]?.index ?? pickDifferentCity(random, target);
}
function generateCampaign(seed) {
  const random = mulberry32(seed); const campaign = []; let previousTarget = -1;
  for (let round = 0; round < TOTAL_ROUNDS; round += 1) {
    let target = Math.floor(random() * CITY_DATA.length);
    if (target === previousTarget) target = (target + 1 + Math.floor(random() * (CITY_DATA.length - 1))) % CITY_DATA.length;
    previousTarget = target;
    const decoyA = pickDifferentCity(random, target); const decoyB = pickDifferentCity(random, target, [decoyA]); let claims;
    if (round === 0) claims = { scout: target, merchant: target, bell: target };
    else if (round === 1) claims = { scout: target, merchant: weightedMerchantDecoy(random, target), bell: target };
    else {
      const scout = random() < SOURCE_DATA.scout.bias ? target : decoyA;
      const merchant = random() < SOURCE_DATA.merchant.bias ? target : weightedMerchantDecoy(random, target);
      let bell;
      if (random() < SOURCE_DATA.bell.bias) bell = target;
      else if (random() < .62) bell = random() < .5 ? scout : merchant;
      else bell = decoyB;
      claims = { scout, merchant, bell };
      const correctCount = SOURCE_KEYS.filter((key) => claims[key] === target).length;
      if (correctCount === 0) claims[SOURCE_KEYS[Math.floor(random() * SOURCE_KEYS.length)]] = target;
      if (correctCount === SOURCE_KEYS.length && round > 1) claims.bell = decoyA;
    }
    campaign.push({ target, claims, start: attackStartForTarget(target, random), curl: random() * 2 - 1 });
  }
  return campaign;
}
function attackStartForTarget(target, random) {
  const city = CITY_DATA[target];
  if (city.x < .34) return { x: -.04, y: clamp(city.y + (random() - .5) * .25, .05, .95) };
  if (city.x > .68) return { x: 1.04, y: clamp(city.y + (random() - .5) * .25, .05, .95) };
  if (city.y < .42) return { x: clamp(city.x + (random() - .5) * .28, .05, .95), y: -.05 };
  return { x: clamp(city.x + (random() - .5) * .28, .05, .95), y: 1.05 };
}
function currentScenario() { return state.campaign[state.round] || null; }

function startNewCampaign() {
  const persistent = { best: state.best, soundEnabled: state.soundEnabled };
  state = createInitialState(); state.best = persistent.best; state.soundEnabled = persistent.soundEnabled;
  state.active = true; state.seed = createSeed(); state.campaign = generateCampaign(state.seed);
  state.phase = 'planning'; state.visibleSources = [...SOURCE_KEYS]; saveState(); beginGameFromOverlay(true);
}
function resumeCampaign() { if (!state.active) { startNewCampaign(); return; } state.phase = 'planning'; beginGameFromOverlay(false); }
function beginGameFromOverlay(isNew) {
  hideResult(); dom.introScreen.classList.add('leaving');
  setTimeout(() => { dom.introScreen.hidden = true; dom.introScreen.classList.remove('leaving'); updateAllUi(); resizeCanvas(); requestDraw(); if (isNew && state.round === 0 && state.shieldCity === null) scheduleShieldLesson(); }, reducedMotion ? 0 : 720);
  playSound('open'); haptic(12);
}
function showIntro() {
  dom.introScreen.hidden = false;
  const canContinue = state.active && state.lives > 0 && state.round < TOTAL_ROUNDS;
  dom.startLabel.textContent = canContinue ? 'ПРОДОЛЖИТЬ' : 'НАЧАТЬ'; dom.newCampaignButton.hidden = !canContinue;
}
function hideResult() { dom.resultScreen.hidden = true; }
function scheduleShieldLesson() {
  clearTimeout(lessonTimer);
  lessonTimer = setTimeout(() => { if (state.phase !== 'planning' || state.shieldCity !== null || dom.introScreen.hidden === false) return; showShieldLesson(); }, 800);
}
function showShieldLesson() {
  const scenario = currentScenario(); if (!scenario) return;
  const from = centerOf(dom.shieldTool); const targetButton = dom.cityLayer.querySelector(`[data-city-index="${scenario.target}"]`); if (!targetButton) return;
  const to = centerOf(targetButton); dom.lessonToken.style.left = `${from.x}px`; dom.lessonToken.style.top = `${from.y}px`;
  dom.lessonToken.style.setProperty('--lesson-from-x', '0px'); dom.lessonToken.style.setProperty('--lesson-from-y', '0px');
  dom.lessonToken.style.setProperty('--lesson-to-x', `${to.x - from.x}px`); dom.lessonToken.style.setProperty('--lesson-to-y', `${to.y - from.y}px`);
  dom.lessonTarget.style.left = `${to.x}px`; dom.lessonTarget.style.top = `${to.y}px`; dom.gestureLesson.hidden = false;
}
function hideLesson() { clearTimeout(lessonTimer); dom.gestureLesson.hidden = true; }
function centerOf(element) { const rect = element.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; }
