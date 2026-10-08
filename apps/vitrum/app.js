import { installMobileRuntime } from '../../shared/mobile-runtime.js';

installMobileRuntime();

const STORAGE_KEY = 'pocket-works:vitrum:state';
const STAGES = ['design', 'cut', 'assemble', 'lead', 'solder', 'reveal'];
const PIECE_COUNT = 7;
const JOINT_COUNT = 7;
const CHIP_COUNT = 5;
const PALETTE = [
  { name: 'кобальт', base: '#255f9d', dark: '#12375f', light: '#72b8df' },
  { name: 'рубин', base: '#ae3a31', dark: '#681d25', light: '#ef7a58' },
  { name: 'янтарь', base: '#d18b2e', dark: '#87421d', light: '#f4c65e' },
  { name: 'зелень', base: '#3d7753', dark: '#1d4d39', light: '#75ad78' },
  { name: 'молочное', base: '#bfb495', dark: '#776e5d', light: '#eee4c7' }
];
const MOTIFS = ['звезда', 'лилия', 'крест'];
const DEFAULT_COLORS = [0, 1, 2, 0, 3, 1, 4];

const canvas = document.querySelector('#workCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
const frame = document.querySelector('#canvasFrame');
const toast = document.querySelector('#toast');
const stageTitle = document.querySelector('#stageTitle');
const stageEyebrow = document.querySelector('#stageEyebrow');
const stageHint = document.querySelector('#stageHint');
const soundToggle = document.querySelector('#soundToggle');
const motifButton = document.querySelector('#motifButton');
const startCutButton = document.querySelector('#startCutButton');
const cutCount = document.querySelector('#cutCount');
const cutMeterFill = document.querySelector('#cutMeterFill');
const cutInstruction = document.querySelector('#cutInstruction');
const pieceTray = document.querySelector('#pieceTray');
const leadButton = document.querySelector('#leadButton');
const leadCount = document.querySelector('#leadCount');
const leadInstruction = document.querySelector('#leadInstruction');
const solderCount = document.querySelector('#solderCount');
const revealButton = document.querySelector('#revealButton');
const sunSlider = document.querySelector('#sunSlider');
const newProjectButton = document.querySelector('#newProjectButton');
const resetDialog = document.querySelector('#resetDialog');
const cancelReset = document.querySelector('#cancelReset');
const confirmReset = document.querySelector('#confirmReset');
const docks = Object.fromEntries(STAGES.map((stage) => [stage, document.querySelector(`#${stage}Dock`)]));
const stageMarkers = [...document.querySelectorAll('.stage-marker')];
const swatches = [...document.querySelectorAll('.glass-swatch')];

let cssWidth = 0;
let cssHeight = 0;
let dpr = 1;
let state = loadState();
let toastTimer = 0;
let dirty = true;
let lastRevealFrame = 0;
let cutGesture = { active: false, pointerId: null, lastTickIndex: -1 };
let audioContext = null;
let toolCursor = null;
const effects = [];
let lastFrameTime = 0;
let lastHeatSaved = 0;
let assembleDrag = { active: false };
let leadGesture = { active: false };
let solderGesture = { active: false };

function defaultState() {
  return {
    stage: 'design',
    selectedColor: 0,
    colors: [...DEFAULT_COLORS],
    motif: 0,
    cutDone: Array(PIECE_COUNT).fill(false),
    cutProgress: Array(PIECE_COUNT).fill(0),
    chipProgress: Array(PIECE_COUNT).fill(0),
    cutIndex: 0,
    assembled: Array(PIECE_COUNT).fill(false),
    leadProgress: Array(PIECE_COUNT).fill(0),
    leadIndex: 0,
    selectedPiece: null,
    soldered: Array(JOINT_COUNT).fill(false),
    solderHeat: Array(JOINT_COUNT).fill(0),
    sun: 18,
    sound: true,
    finished: false
  };
}

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw || !STAGES.includes(raw.stage)) return defaultState();
    const next = defaultState();
    next.stage = raw.stage;
    next.selectedColor = clampInt(raw.selectedColor, 0, PALETTE.length - 1, 0);
    next.colors = Array.isArray(raw.colors) && raw.colors.length === PIECE_COUNT
      ? raw.colors.map((value, i) => clampInt(value, 0, PALETTE.length - 1, DEFAULT_COLORS[i]))
      : next.colors;
    next.motif = clampInt(raw.motif, 0, MOTIFS.length - 1, 0);
    next.cutDone = normalizeFlags(raw.cutDone, PIECE_COUNT);
    next.cutProgress = Array.isArray(raw.cutProgress) && raw.cutProgress.length === PIECE_COUNT
      ? raw.cutProgress.map((value) => Math.max(0, Math.min(1, Number(value) || 0)))
      : next.cutProgress;
    next.chipProgress = Array.isArray(raw.chipProgress) && raw.chipProgress.length === PIECE_COUNT
      ? raw.chipProgress.map(value => clampInt(value, 0, CHIP_COUNT, 0)) : next.chipProgress;
    // Old cut completions remain valid when upgrading an unfinished 1.x workshop.
    next.cutDone.forEach((done, i) => { if (done) next.chipProgress[i] = CHIP_COUNT; });
    next.cutIndex = clampInt(raw.cutIndex, 0, PIECE_COUNT - 1, 0);
    next.assembled = normalizeFlags(raw.assembled, PIECE_COUNT);
    next.leadProgress = Array.isArray(raw.leadProgress) && raw.leadProgress.length === PIECE_COUNT
      ? raw.leadProgress.map(v => Math.max(0, Math.min(1, Number(v) || 0))) : next.leadProgress;
    next.leadIndex = clampInt(raw.leadIndex, 0, PIECE_COUNT - 1, 0);
    // Preserve assembled old-format projects that reached soldering before hand-laid lead existed.
    if (['solder','reveal'].includes(raw.stage) && !Array.isArray(raw.leadProgress)) next.leadProgress.fill(1);
    next.selectedPiece = Number.isInteger(raw.selectedPiece) && raw.selectedPiece >= 0 && raw.selectedPiece < PIECE_COUNT ? raw.selectedPiece : null;
    next.soldered = normalizeFlags(raw.soldered, JOINT_COUNT);
    next.solderHeat = Array.isArray(raw.solderHeat) && raw.solderHeat.length===JOINT_COUNT
      ? raw.solderHeat.map(v=>Math.max(0,Math.min(1,Number(v)||0))) : next.solderHeat;
    next.soldered.forEach((done,i)=> {if(done)next.solderHeat[i]=1;});
    next.sun = Number.isFinite(Number(raw.sun)) ? Math.max(-70, Math.min(70, Number(raw.sun))) : 18;
    next.sound = raw.sound !== false;
    next.finished = raw.finished === true;
    return next;
  } catch {
    return defaultState();
  }
}

function normalizeFlags(value, length) {
  return Array.from({ length }, (_, i) => Boolean(Array.isArray(value) && value[i]));
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  publishTestState();
}

function publishTestState() {
  window.__AI_TEST_STATE__ = {
    app: 'vitrum',
    version: '1.0.0',
    stage: state.stage,
    cut: state.cutDone.filter(Boolean).length,
    chip: state.chipProgress[state.cutIndex],
    assembled: state.assembled.filter(Boolean).length,
    lead: state.leadProgress.filter(v => v >= .995).length,
    soldered: state.soldered.filter(Boolean).length,
    heat: state.solderHeat.map(v=>Math.round(v*100)),
    selectedPiece: state.selectedPiece,
    finished: state.finished
  };
}

function markDirty() { dirty = true; }

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 1500);
}

function haptic(pattern = 8) {
  try { navigator.vibrate?.(pattern); } catch {}
}

function ensureAudio() {
  if (!state.sound) return null;
  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    audioContext = new AudioCtx();
  }
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  return audioContext;
}

function tone(kind = 'tap') {
  const ac = ensureAudio();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(kind === 'score' ? 2100 : 1400, now);
  osc.type = kind === 'solder' ? 'triangle' : 'sine';
  const config = {
    tap: [330, 260, .035, .035],
    glass: [620, 410, .08, .052],
    score: [980, 570, .055, .028],
    solder: [180, 320, .12, .045],
    reveal: [220, 420, .3, .04],
    error: [120, 92, .1, .045]
  }[kind] || [330, 260, .05, .035];
  osc.frequency.setValueAtTime(config[0], now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, config[1]), now + config[2]);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(config[3], now + .008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + config[2]);
  osc.connect(filter).connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + config[2] + .02);
}

function setStage(next) {
  state.stage = next;
  state.selectedPiece = null;
  docks.design.classList.toggle('is-visible', next === 'design');
  docks.cut.classList.toggle('is-visible', next === 'cut');
  docks.assemble.classList.toggle('is-visible', next === 'assemble');
  docks.lead.classList.toggle('is-visible', next === 'lead');
  docks.solder.classList.toggle('is-visible', next === 'solder');
  docks.reveal.classList.toggle('is-visible', next === 'reveal');

  const index = STAGES.indexOf(next);
  stageMarkers.forEach((marker, i) => {
    marker.classList.toggle('is-active', i === Math.min(index, 4));
    marker.classList.toggle('is-done', i < index);
    marker.disabled = true;
  });

  const copy = {
    design: ['Картон · выбор стекла', 'Соберите цветовую схему', 'Выберите лист стекла снизу и коснитесь элемента розы.'],
    cut: ['Раскрой · резец и клещи', 'Надрезать, затем отколоть', 'Ведите резец по контуру. После надреза откалывайте выступающие края клещами.'],
    assemble: ['Сборка · стекло на картоне', 'Уложите кусочки вручную', 'Возьмите деталь из нижнего лотка и перетащите на совпадающее место.'],
    lead: ['Свинец · Н-профиль', 'Обогните стекло свинцом', 'От золотой метки протяните тёмную полосу вдоль края детали.'],
    solder: ['Пайка · раскалённое железо', 'Пропаяйте каждое соединение', 'Прижмите наконечник к медному узлу и держите до полного расплавления припоя.'],
    reveal: ['Установка · северный трансепт', 'Окно готово', 'Проведите солнце по шкале и посмотрите, как меняется цветной свет.']
  }[next];
  stageEyebrow.textContent = copy[0];
  stageTitle.textContent = copy[1];
  stageHint.textContent = copy[2];
  updateControls();
  persist();
  markDirty();
}

function updateControls() {
  swatches.forEach((button, i) => button.classList.toggle('is-selected', i === state.selectedColor));
  motifButton.textContent = `Медальон: ${MOTIFS[state.motif]}`;
  soundToggle.setAttribute('aria-pressed', String(state.sound));
  soundToggle.textContent = state.sound ? 'Звук · вкл' : 'Звук · выкл';
  const cutFinished = state.cutDone.filter(Boolean).length;
  const current = Math.min(state.cutIndex + 1, PIECE_COUNT);
  cutCount.textContent = `${current} / ${PIECE_COUNT}`;
  const progress = state.cutDone[state.cutIndex] ? 1 : (state.cutProgress[state.cutIndex] || 0);
  const chips = state.chipProgress[state.cutIndex] || 0;
  const trimMode = progress >= .995;
  cutMeterFill.style.width = `${Math.round((progress * .7 + chips / CHIP_COUNT * .3) * 100)}%`;
  cutInstruction.textContent = cutFinished === PIECE_COUNT
    ? 'Все кусочки стекла освобождены.'
    : trimMode ? `Клещи: отколите край у светлой засечки · ${chips} из ${CHIP_COUNT}`
      : progress > 0 ? 'Тяните резец вдоль трещины, не перескакивая линию.'
      : 'Поставьте резец на латунную точку и ведите вдоль силуэта.';
  leadButton.disabled = !state.assembled.every(Boolean);
  leadCount.textContent = `${state.leadProgress.filter(v => v >= .995).length} / ${PIECE_COUNT}`;
  leadInstruction.textContent = `Проведите свинец по контуру детали ${Math.min(state.leadIndex + 1, PIECE_COUNT)} из ${PIECE_COUNT}`;
  solderCount.textContent = `${state.soldered.filter(Boolean).length} / ${JOINT_COUNT}`;
  revealButton.disabled = !state.soldered.every(Boolean);
  sunSlider.value = String(state.sun);
  renderPieceTray();
}

function renderPieceTray() {
  if (state.stage !== 'assemble') return;
  pieceTray.replaceChildren();
  state.cutDone.forEach((done, i) => {
    if (!done) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'piece-chip';
    button.dataset.piece = String(i);
    button.dataset.nativePress = '';
    button.setAttribute('aria-label', i === 6 ? 'Центральный медальон' : `Лепесток ${i + 1}`);
    button.style.setProperty('--piece-color', PALETTE[state.colors[i]].base);
    button.classList.toggle('is-selected', state.selectedPiece === i);
    button.classList.toggle('is-placed', state.assembled[i]);
    button.disabled = state.assembled[i];
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      beginAssemblyDrag(event, i, button);
    });
    button.addEventListener('click', event => {
      if (event.detail !== 0) return; // keyboard accessibility
      state.selectedPiece = i; tone('tap'); haptic(5);
      updateControls(); persist(); markDirty();
    });
    pieceTray.append(button);
  });
}

function resizeCanvas() {
  const rect = frame.getBoundingClientRect();
  cssWidth = Math.max(1, rect.width);
  cssHeight = Math.max(1, rect.height);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const nextWidth = Math.round(cssWidth * dpr);
  const nextHeight = Math.round(cssHeight * dpr);
  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    markDirty();
  }
}

function seeded(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let v = t;
    v = Math.imul(v ^ v >>> 15, v | 1);
    v ^= v + Math.imul(v ^ v >>> 7, v | 61);
    return ((v ^ v >>> 14) >>> 0) / 4294967296;
  };
}

function polar(cx, cy, r, angle) {
  return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
}

function regionGeometry() {
  const cx = cssWidth * .5;
  const cy = cssHeight * (state.stage === 'reveal' ? .38 : .47);
  const r = Math.min(cssWidth * .37, cssHeight * (state.stage === 'reveal' ? .29 : .36));
  const pieces = [];
  for (let i = 0; i < 6; i++) {
    const angle = -Math.PI / 2 + i * Math.PI / 3;
    const inner = r * .25;
    pieces.push([
      polar(cx, cy, inner, angle - .39),
      polar(cx, cy, r * .57, angle - .26),
      polar(cx, cy, r * .88, angle),
      polar(cx, cy, r * .57, angle + .26),
      polar(cx, cy, inner, angle + .39)
    ]);
  }
  const center = [];
  for (let i = 0; i < 10; i++) center.push(polar(cx, cy, r * .235, -Math.PI / 2 + i * Math.PI / 5));
  pieces.push(center);
  return { cx, cy, r, pieces };
}

function pathFromPoints(points) {
  const p = new Path2D();
  p.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) p.lineTo(points[i].x, points[i].y);
  p.closePath();
  return p;
}

function pointInPolygon(point, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    const intersect = ((a.y > point.y) !== (b.y > point.y)) &&
      (point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || 1e-6) + a.x);
    if (intersect) inside = !inside;
  }
  return inside;
}

function polySamples(points, perEdge = 16) {
  const samples = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    for (let s = 0; s < perEdge; s++) {
      const t = s / perEdge;
      samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  samples.push({ ...points[0] });
  return samples;
}

function cutGeometry(index) {
  const base = regionGeometry();
  const source = base.pieces[index];
  const sourceCenter = source.reduce((acc, p) => ({ x: acc.x + p.x / source.length, y: acc.y + p.y / source.length }), { x: 0, y: 0 });
  const maxRadius = Math.max(...source.map((p) => Math.hypot(p.x - sourceCenter.x, p.y - sourceCenter.y)));
  const targetRadius = Math.min(cssWidth * .31, cssHeight * .285);
  const scale = targetRadius / Math.max(1, maxRadius);
  const cx = cssWidth * .5;
  const cy = cssHeight * .49;
  const points = source.map((p) => ({ x: cx + (p.x - sourceCenter.x) * scale, y: cy + (p.y - sourceCenter.y) * scale }));
  return { points, samples: polySamples(points, index === 6 ? 8 : 15), cx, cy, radius: targetRadius };
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, cssWidth, cssHeight);
  g.addColorStop(0, '#342014');
  g.addColorStop(.5, '#23160f');
  g.addColorStop(1, '#130d09');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  ctx.save();
  ctx.globalAlpha = .11;
  ctx.strokeStyle = '#c5935c';
  ctx.lineWidth = 1;
  for (let x = -20; x < cssWidth + 40; x += 37) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + 12, cssHeight * .22, x - 9, cssHeight * .68, x + 18, cssHeight);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPaper(geo) {
  const pad = geo.r * 1.15;
  ctx.save();
  ctx.translate(geo.cx, geo.cy);
  ctx.rotate(-.012);
  const x = -pad, y = -pad * 1.05, w = pad * 2, h = pad * 2.1;
  ctx.shadowColor = 'rgba(0,0,0,.42)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 9;
  const pg = ctx.createLinearGradient(x, y, x + w, y + h);
  pg.addColorStop(0, '#cdbc97');
  pg.addColorStop(.54, '#e2d2ad');
  pg.addColorStop(1, '#bda57e');
  ctx.fillStyle = pg;
  ctx.fillRect(x, y, w, h);
  ctx.shadowColor = 'transparent';
  ctx.globalAlpha = .18;
  ctx.strokeStyle = '#806e51';
  for (let yy = y + 12; yy < y + h; yy += 8) {
    ctx.beginPath();
    ctx.moveTo(x + 8, yy);
    ctx.lineTo(x + w - 8, yy + Math.sin(yy * .1) * 1.3);
    ctx.stroke();
  }
  ctx.restore();
}

function drawConstruction(geo) {
  ctx.save();
  ctx.strokeStyle = 'rgba(71,55,39,.34)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.arc(geo.cx, geo.cy, geo.r * .93, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(geo.cx, geo.cy, geo.r * .25, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const p = polar(geo.cx, geo.cy, geo.r, -Math.PI / 2 + i * Math.PI / 3);
    ctx.beginPath(); ctx.moveTo(geo.cx, geo.cy); ctx.lineTo(p.x, p.y); ctx.stroke();
  }
  ctx.restore();
}

function glassFill(path, colorIndex, seedValue, alpha = .94, lightBias = 0) {
  const c = PALETTE[colorIndex];
  const rnd = seeded(9137 + seedValue * 101);
  ctx.save();
  ctx.clip(path);
  ctx.globalAlpha = alpha;
  const g = ctx.createLinearGradient(0, cssHeight * .15, cssWidth, cssHeight * .82);
  g.addColorStop(0, c.light);
  g.addColorStop(.3 + lightBias * .08, c.base);
  g.addColorStop(1, c.dark);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = .18;
  ctx.strokeStyle = '#fff7da';
  for (let i = 0; i < 5; i++) {
    const x = rnd() * cssWidth;
    const y = rnd() * cssHeight;
    ctx.lineWidth = .6 + rnd() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x - 70, y - 22);
    ctx.bezierCurveTo(x - 15, y + 13, x + 18, y - 18, x + 82, y + 8);
    ctx.stroke();
  }
  ctx.globalAlpha = .23;
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    const r = .7 + rnd() * 2.3;
    ctx.arc(rnd() * cssWidth, rnd() * cssHeight, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = .13;
  const glow = ctx.createRadialGradient(cssWidth * .35, cssHeight * .26, 0, cssWidth * .35, cssHeight * .26, Math.max(cssWidth, cssHeight) * .5);
  glow.addColorStop(0, '#fff');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  ctx.restore();
}

function drawLeadNetwork(geo, assembledOnly = false, strong = true) {
  ctx.save();
  for (let i = 0; i < geo.pieces.length; i++) {
    if (assembledOnly && !state.assembled[i]) continue;
    const path = pathFromPoints(geo.pieces[i]);
    ctx.strokeStyle = strong ? '#282725' : 'rgba(62,55,48,.55)';
    ctx.lineWidth = strong ? Math.max(6, geo.r * .045) : Math.max(2, geo.r * .018);
    ctx.lineJoin = 'round';
    ctx.stroke(path);
    if (strong) {
      ctx.strokeStyle = 'rgba(170,164,151,.28)';
      ctx.lineWidth = Math.max(1, geo.r * .008);
      ctx.stroke(path);
    }
  }
  ctx.beginPath();
  ctx.arc(geo.cx, geo.cy, geo.r * .95, 0, Math.PI * 2);
  ctx.strokeStyle = strong ? '#242321' : 'rgba(62,55,48,.56)';
  ctx.lineWidth = strong ? Math.max(8, geo.r * .055) : Math.max(2, geo.r * .02);
  ctx.stroke();
  if (strong) {
    ctx.strokeStyle = 'rgba(190,180,163,.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function drawMotif(geo, subtle = false) {
  const radius = geo.r * .13;
  ctx.save();
  ctx.translate(geo.cx, geo.cy);
  ctx.strokeStyle = subtle ? 'rgba(55,44,34,.58)' : 'rgba(39,35,31,.9)';
  ctx.fillStyle = subtle ? 'rgba(55,44,34,.24)' : 'rgba(248,221,164,.55)';
  ctx.lineWidth = Math.max(1.5, geo.r * .012);
  if (state.motif === 0) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 4;
      const rr = i % 2 === 0 ? radius : radius * .44;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (state.motif === 1) {
    ctx.beginPath();
    ctx.moveTo(0, radius);
    ctx.bezierCurveTo(-radius * .12, radius * .3, -radius * .75, radius * .2, -radius * .72, -radius * .14);
    ctx.bezierCurveTo(-radius * .7, -radius * .52, -radius * .2, -radius * .45, 0, -radius);
    ctx.bezierCurveTo(radius * .2, -radius * .45, radius * .7, -radius * .52, radius * .72, -radius * .14);
    ctx.bezierCurveTo(radius * .75, radius * .2, radius * .12, radius * .3, 0, radius);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -radius); ctx.lineTo(0, radius * 1.08); ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.rect(-radius * .17, -radius, radius * .34, radius * 2);
    ctx.rect(-radius * .65, -radius * .32, radius * 1.3, radius * .34);
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function drawRose(stageMode = 'design') {
  const geo = regionGeometry();
  if (stageMode === 'design') {
    drawPaper(geo);
    drawConstruction(geo);
    geo.pieces.forEach((points, i) => {
      const path = pathFromPoints(points);
      glassFill(path, state.colors[i], i, .74);
      ctx.strokeStyle = 'rgba(69,52,38,.64)';
      ctx.lineWidth = Math.max(2, geo.r * .017);
      ctx.stroke(path);
    });
    drawMotif(geo, true);
  } else if (stageMode === 'assemble') {
    drawLightTable(geo);
    geo.pieces.forEach((points, i) => {
      const path = pathFromPoints(points);
      if (state.assembled[i]) {
        glassFill(path, state.colors[i], i, .96);
        ctx.strokeStyle = 'rgba(43,39,35,.78)';
        ctx.lineWidth = Math.max(2, geo.r * .018);
        ctx.stroke(path);
      } else {
        ctx.save();
        ctx.setLineDash([5, 6]);
        ctx.strokeStyle = state.selectedPiece === i ? 'rgba(226,181,105,.76)' : 'rgba(104,91,72,.5)';
        ctx.lineWidth = state.selectedPiece === i ? 2.4 : 1.3;
        ctx.stroke(path);
        ctx.restore();
      }
    });
    if (state.assembled[6]) drawMotif(geo, false);
    drawLeadNetwork(geo, true, false);
  } else {
    drawLightTable(geo);
    geo.pieces.forEach((points, i) => glassFill(pathFromPoints(points), state.colors[i], i, .98));
    drawMotif(geo, false);
    drawLeadNetwork(geo, false, true);
  }
  return geo;
}

function drawLightTable(geo) {
  const rr = geo.r * 1.09;
  ctx.save();
  const glow = ctx.createRadialGradient(geo.cx, geo.cy, rr * .1, geo.cx, geo.cy, rr * 1.2);
  glow.addColorStop(0, '#e2d1a8');
  glow.addColorStop(.72, '#9c896b');
  glow.addColorStop(1, '#544531');
  ctx.fillStyle = glow;
  ctx.shadowColor = 'rgba(242,210,150,.15)';
  ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.arc(geo.cx, geo.cy, rr, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#3a2a1c';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.restore();
}

function chipPoint(geometry, step) {
  const index = Math.min(geometry.samples.length - 2, Math.round(((step + .45) / CHIP_COUNT) * (geometry.samples.length - 1)));
  return geometry.samples[index];
}
function scatterGlass(x, y, paletteIndex, type = 'chip') {
  const color = PALETTE[paletteIndex];
  const now = performance.now();
  const rnd = seeded(Math.floor(now) + Math.round(x * 33 + y * 7));
  for (let i = 0; i < (type === 'chip' ? 14 : 8); i++) {
    const angle = rnd() * Math.PI * 2, speed = 22 + rnd() * 80;
    effects.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 25, start: now,
      duration: 430 + rnd() * 250, size: 1.5 + rnd() * 5.3, color: i % 4 ? color.light : '#fff3ce', angle });
  }
}
function drawEffects(time) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i], age = (time - fx.start) / fx.duration;
    if (age >= 1) { effects.splice(i, 1); continue; }
    const t = age * fx.duration * .001, fade = (1 - age) * (1 - age);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(fx.x + fx.vx * t, fx.y + fx.vy * t + 120 * t * t);
    ctx.rotate(fx.angle + age * 2);
    ctx.fillStyle = fx.color;
    ctx.shadowBlur = 5;
    ctx.shadowColor = fx.color;
    ctx.beginPath(); ctx.moveTo(0, -fx.size); ctx.lineTo(fx.size * .8, fx.size * .8); ctx.lineTo(-fx.size * .6, fx.size * .45); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
function drawTool(kind, x, y, time) {
  if (x == null || y == null) return;
  ctx.save();
  ctx.translate(x - 22, y - 30);
  ctx.rotate(-.73);
  ctx.shadowColor = 'rgba(0,0,0,.5)';
  ctx.shadowBlur = 9; ctx.shadowOffsetY = 4;
  if (kind === 'solder') {
    ctx.fillStyle = '#442d1b'; ctx.fillRect(-5, -50, 10, 35);
    ctx.fillStyle = '#b67d43'; ctx.fillRect(-3.7, -18, 7.4, 31);
    ctx.fillStyle = '#d0b295'; ctx.beginPath(); ctx.moveTo(-3.7, 13); ctx.lineTo(0, 34); ctx.lineTo(3.7, 13); ctx.fill();
    ctx.shadowColor = 'rgba(255,167,70,.7)'; ctx.shadowBlur = 15;
    ctx.fillStyle = '#ffca7f'; ctx.beginPath(); ctx.arc(0, 33, 3.8, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'chip') {
    ctx.strokeStyle = '#bdaca0'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();ctx.moveTo(-12, -27);ctx.lineTo(-2, 5);ctx.lineTo(-8, 30);ctx.moveTo(12, -27);ctx.lineTo(2, 5);ctx.lineTo(8, 30);ctx.stroke();
    ctx.strokeStyle = '#423b37'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-13,-26);ctx.lineTo(-2,5);ctx.lineTo(-8,31);ctx.moveTo(13,-26);ctx.lineTo(2,5);ctx.lineTo(8,31);ctx.stroke();
    ctx.fillStyle = '#d0b08a';ctx.beginPath();ctx.arc(0,5,4,0,Math.PI*2);ctx.fill();
  } else {
    const body = ctx.createLinearGradient(-6,0,6,0);
    body.addColorStop(0, '#453d33'); body.addColorStop(.4, '#d8be92'); body.addColorStop(1, '#514b40');
    ctx.fillStyle= '#603d20'; ctx.fillRect(-6,-42,12,37);
    ctx.fillStyle=body;ctx.fillRect(-4,-5,8,30);
    ctx.fillStyle='#e4dfd1';ctx.beginPath();ctx.moveTo(-3.8,24);ctx.lineTo(0,37);ctx.lineTo(3.8,24);ctx.fill();
  }
  ctx.restore();
}
function drawCutStage() {
  const g = cutGeometry(state.cutIndex);
  const color = PALETTE[state.colors[state.cutIndex]];
  const sheetW = Math.min(cssWidth * .86, g.radius * 2.8);
  const sheetH = Math.min(cssHeight * .75, g.radius * 2.7);
  const sx = (cssWidth - sheetW) / 2;
  const sy = (cssHeight - sheetH) / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.48)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 10;
  const sheet = ctx.createLinearGradient(sx, sy, sx + sheetW, sy + sheetH);
  sheet.addColorStop(0, color.light);
  sheet.addColorStop(.35, color.base);
  sheet.addColorStop(1, color.dark);
  ctx.fillStyle = sheet;
  ctx.globalAlpha = .94;
  ctx.fillRect(sx, sy, sheetW, sheetH);
  ctx.shadowColor = 'transparent';
  ctx.globalAlpha = .2;
  ctx.strokeStyle = '#fff';
  const rnd = seeded(2200 + state.cutIndex);
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    const y = sy + rnd() * sheetH;
    ctx.moveTo(sx, y);
    ctx.bezierCurveTo(sx + sheetW * .3, y + rnd() * 18 - 9, sx + sheetW * .7, y + rnd() * 20 - 10, sx + sheetW, y + rnd() * 14 - 7);
    ctx.stroke();
  }
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.arc(sx + rnd() * sheetW, sy + rnd() * sheetH, 1 + rnd() * 2.1, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  const path = pathFromPoints(g.points);
  ctx.save();
  ctx.setLineDash([7, 6]);
  ctx.strokeStyle = 'rgba(255,239,196,.64)';
  ctx.lineWidth = 2;
  ctx.stroke(path);
  ctx.restore();

  const progress = state.cutProgress[state.cutIndex] || 0;
  const trimMode = progress >= .995;
  const chips = state.chipProgress[state.cutIndex] || 0;
  const upto = Math.max(1, Math.floor(progress * (g.samples.length - 1)));
  ctx.save();
  ctx.strokeStyle = trimMode ? '#fff8d0' : 'rgba(250,239,202,.83)';
  ctx.lineWidth = trimMode ? 1.5 : 2.2;
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(255,209,117,.48)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(g.samples[0].x, g.samples[0].y);
  for (let i = 1; i <= upto; i++) ctx.lineTo(g.samples[i].x, g.samples[i].y);
  ctx.stroke();
  ctx.restore();

  // Freshly bitten edges scatter chips and expose the rough core of the glass.
  if (trimMode) {
    for (let i = 0; i < CHIP_COUNT; i++) {
      const p = chipPoint(g, i);
      const done = i < chips;
      ctx.save();
      ctx.translate(p.x, p.y);
      if (done) {
        ctx.strokeStyle = 'rgba(245,244,221,.92)'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(-6,-3);ctx.lineTo(0,4);ctx.lineTo(5,-4);ctx.stroke();
        ctx.fillStyle = 'rgba(28,17,14,.62)';
        ctx.beginPath(); ctx.moveTo(-5,-4);ctx.lineTo(0,-10);ctx.lineTo(5,-3);ctx.lineTo(3,2);ctx.lineTo(-3,2);ctx.fill();
      } else {
        ctx.strokeStyle = i === chips ? '#fff1af' : 'rgba(253,239,191,.37)';
        ctx.lineWidth = i === chips ? 3 : 1.5;
        ctx.beginPath(); ctx.arc(0,0,i === chips ? 11:6,0,Math.PI*2);ctx.stroke();
        if (i === chips) {
          ctx.shadowColor='#f2cf83';ctx.shadowBlur=14;
          ctx.fillStyle='#fff1b4'; ctx.beginPath();ctx.arc(0,0,3.5,0,Math.PI*2);ctx.fill();
        }
      }
      ctx.restore();
    }
  }
  const marker = trimMode ? chipPoint(g, Math.min(chips, CHIP_COUNT - 1)) : g.samples[Math.min(upto, g.samples.length - 1)];
  ctx.save();
  ctx.fillStyle = '#e5b56b';
  ctx.strokeStyle = '#5a3518';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(255,195,93,.65)';
  ctx.shadowBlur = 10;
  if (!trimMode) { ctx.beginPath(); ctx.arc(marker.x, marker.y, 7.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  ctx.restore();

  ctx.fillStyle = 'rgba(27,18,13,.56)';
  ctx.fillRect(sx, sy + sheetH - 30, sheetW, 30);
  ctx.fillStyle = 'rgba(246,224,186,.76)';
  ctx.font = '10px Georgia';
  ctx.textAlign = 'center';
  ctx.fillText(trimMode ? `КЛЕЩИ · ${chips}/${CHIP_COUNT} СКОЛОВ` : `РЕЗЕЦ · ${color.name} · деталь ${state.cutIndex + 1}`, cssWidth / 2, sy + sheetH - 11);
}

function jointPositions(geo) {
  const joints = [];
  for (let i = 0; i < 6; i++) joints.push(polar(geo.cx, geo.cy, geo.r * .26, -Math.PI / 2 + i * Math.PI / 3));
  joints.push({ x: geo.cx, y: geo.cy });
  return joints;
}

function drawLeadProfile(samples, progress, width) {
  const count = Math.floor(progress * (samples.length - 1));
  if (count < 1) return;
  ctx.save();ctx.lineCap = 'round';ctx.lineJoin='round';
  ctx.beginPath();ctx.moveTo(samples[0].x,samples[0].y);
  for (let i=1;i<=count;i++) ctx.lineTo(samples[i].x,samples[i].y);
  ctx.strokeStyle='rgba(0,0,0,.65)';ctx.lineWidth=width+3;ctx.shadowColor='#030202';ctx.shadowBlur=5;ctx.shadowOffsetY=3;ctx.stroke();
  ctx.shadowBlur=0;ctx.shadowOffsetY=0;
  ctx.strokeStyle='#424341';ctx.lineWidth=width;ctx.stroke();
  ctx.strokeStyle='rgba(212,209,188,.52)';ctx.lineWidth=Math.max(1,width*.17);ctx.stroke();
  ctx.restore();
}
function leadPath(geometry,index) { return polySamples(geometry.pieces[index], index===PIECE_COUNT-1?7:10); }
function drawLeadStage() {
  const geo=regionGeometry();
  drawLightTable(geo);
  geo.pieces.forEach((points,i)=> {
    glassFill(pathFromPoints(points),state.colors[i],i,.96);
    const samples=leadPath(geo,i);
    ctx.save();
    ctx.strokeStyle = i===state.leadIndex ? 'rgba(244,209,147,.57)' : 'rgba(56,50,42,.38)';
    ctx.lineWidth = i===state.leadIndex ? 2 : 1;
    ctx.setLineDash(i===state.leadIndex ? [3,6]:[2,7]);
    ctx.stroke(pathFromPoints(points));ctx.restore();
    drawLeadProfile(samples,state.leadProgress[i],Math.max(6,geo.r*.055));
  });
  const n=Math.min(state.leadIndex,PIECE_COUNT-1);
  if (state.leadProgress[n] < .995) {
    const samples=leadPath(geo,n);
    const index=Math.floor(state.leadProgress[n]*(samples.length-1));
    const p=samples[index];
    ctx.save();ctx.shadowColor='#ffd890';ctx.shadowBlur=13;ctx.fillStyle='#f7d595';ctx.strokeStyle='#8d632d';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
  }
  if (toolCursor) drawTool('score',toolCursor.x,toolCursor.y,performance.now());
}
function drawAssemblyGhost(time) {
  if (!assembleDrag.active) return;
  const geo=regionGeometry(), i=assembleDrag.index;
  const points=geo.pieces[i], sum=points.reduce((a,p)=>({x:a.x+p.x/points.length,y:a.y+p.y/points.length}),{x:0,y:0});
  const target={x:sum.x,y:sum.y};
  const near=Math.hypot(assembleDrag.x-target.x,assembleDrag.y-target.y)<Math.max(55,geo.r*.39);
  const dx=(near ? target.x*.28+assembleDrag.x*.72 : assembleDrag.x)-sum.x;
  const dy=(near ? target.y*.28+assembleDrag.y*.72 : assembleDrag.y)-sum.y-22;
  const translated=points.map(p=>({x:p.x+dx,y:p.y+dy}));
  const path=pathFromPoints(translated);
  ctx.save();ctx.shadowColor='rgba(0,0,0,.6)';ctx.shadowBlur=19;ctx.shadowOffsetY=10;
  ctx.fillStyle=PALETTE[state.colors[i]].dark;ctx.fill(path);ctx.shadowBlur=0;ctx.shadowOffsetY=0;
  glassFill(path,state.colors[i],i,.99);
  ctx.strokeStyle='rgba(250,239,206,.78)';ctx.lineWidth=2;ctx.stroke(path);
  if(near) {
    ctx.strokeStyle='rgba(255,219,136,.8)';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.stroke(pathFromPoints(points));
  }
  ctx.restore();
}
function beginAssemblyDrag(event,index,element=null) {
  if(state.stage!=='assemble'||state.assembled[index])return;
  if (assembleDrag.active) return;
  event.preventDefault();
  state.selectedPiece=index;
  const rect=canvas.getBoundingClientRect();
  assembleDrag={active:true,pointerId:event.pointerId,index,fromX:event.clientX,fromY:event.clientY,
    x:event.clientX-rect.left,y:event.clientY-rect.top,moved:false,element};
  try{(element||canvas).setPointerCapture?.(event.pointerId);}catch{}
  tone('glass');haptic(7);updateControls();persist();markDirty();
}
function moveAssemblyDrag(event) {
  if(!assembleDrag.active || event.pointerId!==assembleDrag.pointerId)return;
  const rect=canvas.getBoundingClientRect();
  assembleDrag.x=event.clientX-rect.left;assembleDrag.y=event.clientY-rect.top;
  if(Math.hypot(event.clientX-assembleDrag.fromX,event.clientY-assembleDrag.fromY)>18)assembleDrag.moved=true;
  if(event.cancelable)event.preventDefault();
  markDirty();
}
function endAssemblyDrag(event) {
  if(!assembleDrag.active || event.pointerId!==assembleDrag.pointerId)return;
  const drag=assembleDrag;
  moveAssemblyDrag(event);
  assembleDrag={active:false};
  const geo=regionGeometry(), points=geo.pieces[drag.index];
  const center=points.reduce((a,p)=>({x:a.x+p.x/points.length,y:a.y+p.y/points.length}),{x:0,y:0});
  const distance=Math.hypot(drag.x-center.x,drag.y-22-center.y);
  if(drag.moved && distance<Math.max(55,geo.r*.39)) {
    state.assembled[drag.index]=true;
    state.selectedPiece=null;
    tone('glass');haptic([7,18,10]);
    scatterGlass(center.x,center.y,state.colors[drag.index],'settle');
    if(state.assembled.every(Boolean))showToast('Стекло на картоне. Проложите свинцовый профиль.');
  } else if(drag.moved) {
    tone('error');haptic(7);
    showToast('Подведите стекло к его нарисованному контуру.');
  } else {
    showToast('Не отпускайте деталь: проведите её с лотка к схеме.');
  }
  updateControls();persist();markDirty();
}
function beginLead(event,point) {
  const geo=regionGeometry(), n=state.leadIndex, samples=leadPath(geo,n);
  const index=Math.floor(state.leadProgress[n]*(samples.length-1));
  if(Math.hypot(point.x-samples[index].x,point.y-samples[index].y)>35){
    tone('error');showToast('Начните от латунной метки на кромке.');return;
  }
  leadGesture={active:true,pointerId:event.pointerId};
  canvas.setPointerCapture?.(event.pointerId);
  tone('score');haptic(6);
}
function moveLead(event,point) {
  if(!leadGesture.active||leadGesture.pointerId!==event.pointerId)return;
  const geo=regionGeometry(), n=state.leadIndex, samples=leadPath(geo,n);
  const index=Math.floor(state.leadProgress[n]*(samples.length-1));
  const nearest=nearestSample(point,samples);
  if(nearest.distance>Math.max(22,cssWidth*.065)||nearest.index<index-2||nearest.index>index+12)return;
  const next=Math.max(index,nearest.index);
  if(next===index)return;
  state.leadProgress[n]=Math.min(1,next/(samples.length-1));
  if(next%7===0)tone('score');
  markDirty();updateControls();persist();
  if(next>=samples.length-3) {
    state.leadProgress[n]=1;
    leadGesture.active=false;
    tone('glass');haptic([8,25,9]);
    const nextPiece=state.leadProgress.findIndex(v=>v<.995);
    if(nextPiece===-1) {
      showToast('Свинец уложен. Пора спаять пересечения.');
      setStage('solder');
    } else {
      state.leadIndex=nextPiece;
      showToast('Профиль лёг в паз.');
      updateControls();persist();markDirty();
    }
  }
}
function endLead(event) {
  if(leadGesture.pointerId!==event.pointerId)return;
  try{canvas.releasePointerCapture?.(event.pointerId);}catch{}
  leadGesture={active:false};
}
function drawSolderStage() {
  const geo = drawRose('solder');
  const joints = jointPositions(geo);
  joints.forEach((p, i) => {
    ctx.save();
    const done = state.soldered[i], heat = state.solderHeat[i];
    // Raw copper starts dark; molten tin grows from the iron's contact point.
    ctx.fillStyle = done ? '#9b9c94' : '#805637';
    ctx.strokeStyle = done ? '#4d4c49' : '#422b20';
    ctx.lineWidth = 2;
    ctx.shadowColor = heat > 0 && !done ? 'rgba(255,140,65,.9)' : 'rgba(0,0,0,.3)';
    ctx.shadowBlur = 6 + heat * 13;
    const radius=done?6.4:4.2+heat*3.5;
    ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();
    if(heat>0) {
      ctx.globalAlpha = .35 + heat*.58;
      ctx.fillStyle = done ? '#f5f0df':'#ffd497';
      ctx.beginPath();ctx.ellipse(p.x-1.4,p.y-1.9,1.2+heat*2.8,1+heat*1.2,-.3,0,Math.PI*2);ctx.fill();
    }
    if(solderGesture.active && solderGesture.index===i) {
      const pulse= .5 + Math.sin(performance.now()*.019)*.2;
      ctx.globalAlpha=.6+pulse*.25;
      ctx.strokeStyle='#ffd48b';ctx.lineWidth=2.3;ctx.shadowBlur=12;
      ctx.beginPath();ctx.arc(p.x,p.y,11+heat*7,-Math.PI/2,-Math.PI/2+Math.PI*2*heat);ctx.stroke();
      for(let j=0;j<3;j++){
        const t=performance.now()*.001+j*1.9;
        ctx.fillStyle='rgba(234,230,211,.32)';
        ctx.beginPath();ctx.ellipse(p.x+Math.sin(t*2+j)*6,p.y-12-(t*17+j*6)%30,3+j,5+j,0,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.restore();
  });
  return { geo, joints };
}

function drawReveal(time) {
  const geo = regionGeometry();
  const sun = state.sun / 70;
  const stone = ctx.createLinearGradient(0, 0, cssWidth, cssHeight);
  stone.addColorStop(0, '#2b2925');
  stone.addColorStop(.5, '#3a3530');
  stone.addColorStop(1, '#181715');
  ctx.fillStyle = stone;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  // Masonry, deliberately quiet so the glass owns the frame.
  ctx.save();
  ctx.globalAlpha = .12;
  ctx.strokeStyle = '#b4aa99';
  ctx.lineWidth = 1;
  const blockH = Math.max(34, cssHeight / 12);
  for (let y = 0; y < cssHeight; y += blockH) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cssWidth, y); ctx.stroke();
    const offset = Math.round(y / blockH) % 2 ? cssWidth * .12 : -cssWidth * .04;
    for (let x = offset; x < cssWidth; x += cssWidth * .24) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + blockH); ctx.stroke();
    }
  }
  ctx.restore();

  // Coloured light is projected before the window so it feels like a consequence.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const shadowY = geo.cy + geo.r * 1.06;
  for (let i = 0; i < 6; i++) {
    const angle = -Math.PI / 2 + i * Math.PI / 3;
    const source = polar(geo.cx, geo.cy, geo.r * .55, angle);
    const c = PALETTE[state.colors[i]];
    const shift = sun * cssWidth * .33;
    const x = source.x + shift + (source.x - geo.cx) * .28;
    const y = shadowY + cssHeight * .19 + Math.abs(source.y - geo.cy) * .08;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, geo.r * .48);
    rg.addColorStop(0, hexWithAlpha(c.light, .18));
    rg.addColorStop(.45, hexWithAlpha(c.base, .11));
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.ellipse(x, y, geo.r * .42, geo.r * .2, sun * .2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // Deep pointed stone opening.
  ctx.save();
  ctx.fillStyle = '#11110f';
  ctx.strokeStyle = '#171613';
  ctx.lineWidth = geo.r * .26;
  ctx.beginPath();
  ctx.moveTo(geo.cx - geo.r * 1.06, geo.cy + geo.r * 1.12);
  ctx.lineTo(geo.cx - geo.r * 1.06, geo.cy - geo.r * .12);
  ctx.quadraticCurveTo(geo.cx - geo.r * .98, geo.cy - geo.r * 1.08, geo.cx, geo.cy - geo.r * 1.42);
  ctx.quadraticCurveTo(geo.cx + geo.r * .98, geo.cy - geo.r * 1.08, geo.cx + geo.r * 1.06, geo.cy - geo.r * .12);
  ctx.lineTo(geo.cx + geo.r * 1.06, geo.cy + geo.r * 1.12);
  ctx.stroke();
  ctx.restore();

  // Window glass with a slow, tiny highlight drift.
  const shimmer = Math.sin(time * .00045) * .04 + sun * .08;
  geo.pieces.forEach((points, i) => glassFill(pathFromPoints(points), state.colors[i], i, 1, shimmer));
  drawMotif(geo, false);
  drawLeadNetwork(geo, false, true);

  ctx.save();
  const frameGrad = ctx.createLinearGradient(geo.cx - geo.r, geo.cy, geo.cx + geo.r, geo.cy);
  frameGrad.addColorStop(0, '#3b3833');
  frameGrad.addColorStop(.5, '#8b8276');
  frameGrad.addColorStop(1, '#312f2b');
  ctx.strokeStyle = frameGrad;
  ctx.lineWidth = geo.r * .11;
  ctx.beginPath(); ctx.arc(geo.cx, geo.cy, geo.r * 1.02, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  ctx.fillStyle = 'rgba(241,226,198,.5)';
  ctx.font = '10px Georgia';
  ctx.textAlign = 'center';
  ctx.fillText('северный трансепт · окно розы', geo.cx, Math.min(cssHeight - 16, geo.cy + geo.r * 1.42));
}

function hexWithAlpha(hex, alpha) {
  const value = hex.replace('#', '');
  const n = parseInt(value, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function render(time = performance.now()) {
  resizeCanvas();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  if (state.stage === 'reveal') {
    drawReveal(time);
    drawEffects(time);
    return;
  }
  drawBackground();
  if (state.stage === 'design') drawRose('design');
  else if (state.stage === 'cut') drawCutStage();
  else if (state.stage === 'assemble') { drawRose('assemble'); drawAssemblyGhost(time); }
  else if (state.stage === 'lead') drawLeadStage();
  else if (state.stage === 'solder') drawSolderStage();
  drawEffects(time);
  if (toolCursor && (state.stage === 'cut' || state.stage === 'solder')) {
    drawTool(state.stage === 'solder' ? 'solder' : (state.cutProgress[state.cutIndex] >= .995 ? 'chip' : 'score'), toolCursor.x, toolCursor.y, time);
  }
}

function animationLoop(time) {
  const dt=lastFrameTime ? Math.min(64,time-lastFrameTime) : 16;
  lastFrameTime=time;
  if (document.visibilityState === 'visible') {
    updateSolderHold(dt,time);
    if (dirty || effects.length || solderGesture.active || toolCursor || (state.stage === 'reveal' && time - lastRevealFrame > 50)) {
      render(time);
      dirty = false;
      if (state.stage === 'reveal') lastRevealFrame = time;
    }
  }
  requestAnimationFrame(animationLoop);
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function nearestSample(point, samples) {
  let index = -1;
  let distance = Infinity;
  for (let i = 0; i < samples.length; i++) {
    const d = Math.hypot(point.x - samples[i].x, point.y - samples[i].y);
    if (d < distance) { distance = d; index = i; }
  }
  return { index, distance };
}

function handleDesignTap(point) {
  const geo = regionGeometry();
  const index = geo.pieces.findIndex((poly) => pointInPolygon(point, poly));
  if (index < 0) return;
  state.colors[index] = state.selectedColor;
  tone('glass');
  haptic(6);
  persist();
  markDirty();
}

// Keyboard users select a part in the tray; pointer users drag from the tray or across the glass.
function beginAssemblyOnCanvas(event) {
  if(state.selectedPiece===null){showToast('Сначала возьмите кусочек стекла в лотке.');return;}
  beginAssemblyDrag(event,state.selectedPiece);
}

function beginSolder(event,point) {
  const joints=jointPositions(regionGeometry());
  let index=-1,distance=Infinity;
  joints.forEach((p,i)=>{
    if(state.soldered[i])return;
    const d=Math.hypot(point.x-p.x,point.y-p.y);
    if(d<distance){distance=d;index=i;}
  });
  if(index<0||distance>Math.max(32,regionGeometry().r*.19)){
    showToast('Поставьте раскалённое железо на неприпаянный узел.');
    tone('error');return;
  }
  solderGesture={active:true,pointerId:event.pointerId,index,point};
  try{canvas.setPointerCapture?.(event.pointerId);}catch{}
  tone('solder');haptic(8);markDirty();
}
function updateSolderHold(dt,time) {
  if(!solderGesture.active)return;
  const index=solderGesture.index;
  const joint=jointPositions(regionGeometry())[index];
  if(Math.hypot(solderGesture.point.x-joint.x,solderGesture.point.y-joint.y)>Math.max(43,regionGeometry().r*.27))return;
  const old=state.solderHeat[index];
  state.solderHeat[index]=Math.min(1,old+Math.min(60,dt)/720);
  if(time-lastHeatSaved>110){persist();lastHeatSaved=time;}
  if(state.solderHeat[index]>=1){
    state.soldered[index]=true;
    solderGesture={active:false};
    tone('glass');haptic([12,20,12]);
    scatterGlass(joint.x,joint.y,state.colors[index%PIECE_COUNT],'settle');
    if(state.soldered.every(Boolean))showToast('Последний шов запаян. Окно можно поднять к свету.');
    else showToast('Олово схватилось. Следующий узел.');
    updateControls();persist();
  }
  markDirty();
}
function endSolder(event) {
  if(solderGesture.pointerId!==event.pointerId)return;
  try{canvas.releasePointerCapture?.(event.pointerId);}catch{}
  solderGesture={active:false};
  persist();markDirty();
}

function beginCut(event, point) {
  if (state.cutDone[state.cutIndex]) return;
  if (state.cutProgress[state.cutIndex] >= .995) {
    const geometry = cutGeometry(state.cutIndex);
    const step = state.chipProgress[state.cutIndex];
    const target = chipPoint(geometry, step);
    if (Math.hypot(point.x - target.x,point.y - target.y) > 34) {
      showToast('Подведите клещи к светлой засечке на краю стекла.');
      tone('error'); return;
    }
    scatterGlass(target.x, target.y, state.colors[state.cutIndex]);
    state.chipProgress[state.cutIndex] = Math.min(CHIP_COUNT, step + 1);
    tone('glass'); haptic([7, 24, 9]);
    if (state.chipProgress[state.cutIndex] === CHIP_COUNT) finishCurrentCut();
    else { updateControls(); persist(); markDirty(); }
    return;
  }
  const g = cutGeometry(state.cutIndex);
  const progressIndex = Math.floor((state.cutProgress[state.cutIndex] || 0) * (g.samples.length - 1));
  const marker = g.samples[Math.min(progressIndex, g.samples.length - 1)];
  if (Math.hypot(point.x - marker.x, point.y - marker.y) > 32) {
    showToast('Начните с латунной метки.');
    tone('error');
    return;
  }
  cutGesture = { active: true, pointerId: event.pointerId, lastTickIndex: progressIndex };
  canvas.setPointerCapture?.(event.pointerId);
  tone('score');
  haptic(5);
}

function moveCut(event, point) {
  if (!cutGesture.active || cutGesture.pointerId !== event.pointerId) return;
  const g = cutGeometry(state.cutIndex);
  const currentProgress = state.cutProgress[state.cutIndex] || 0;
  const currentIndex = Math.floor(currentProgress * (g.samples.length - 1));
  const near = nearestSample(point, g.samples);
  const tolerance = Math.max(18, Math.min(28, cssWidth * .055));
  if (near.distance > tolerance) return;
  const wrapSafe = near.index >= currentIndex - 2 && near.index <= currentIndex + 10;
  if (!wrapSafe) return;
  const nextIndex = Math.max(currentIndex, near.index);
  state.cutProgress[state.cutIndex] = Math.min(1, nextIndex / (g.samples.length - 1));
  if (nextIndex > cutGesture.lastTickIndex && nextIndex % 5 === 0) {
    cutGesture.lastTickIndex = nextIndex;
    tone('score');
  }
  updateControls();
  persist();
  markDirty();
  if (nextIndex >= g.samples.length - 3) {
    state.cutProgress[state.cutIndex] = 1;
    cutGesture.active = false;
    tone('glass'); haptic(14);
    showToast('Контур надрезан. Теперь отколите края клещами.');
    updateControls(); persist(); markDirty();
  }
}

function endCut(event) {
  if (cutGesture.pointerId !== event.pointerId) return;
  try { canvas.releasePointerCapture?.(event.pointerId); } catch {}
  cutGesture = { active: false, pointerId: null, lastTickIndex: -1 };
}

function finishCurrentCut() {
  if (state.cutDone[state.cutIndex] || state.chipProgress[state.cutIndex] < CHIP_COUNT) return;
  state.cutDone[state.cutIndex] = true;
  state.cutProgress[state.cutIndex] = 1;
  scatterGlass(cssWidth*.5, cssHeight*.5, state.colors[state.cutIndex]);
  tone('glass');
  haptic([8, 24, 12]);
  const finishedIndex = state.cutIndex;
  persist();
  updateControls();
  markDirty();
  window.setTimeout(() => {
    if (state.stage !== 'cut' || state.cutIndex !== finishedIndex) return;
    const next = state.cutDone.findIndex((done) => !done);
    if (next === -1) {
      showToast('Все семь элементов готовы.');
      setStage('assemble');
    } else {
      state.cutIndex = next;
      state.cutProgress[next] = Math.max(0, state.cutProgress[next] || 0);
      updateControls();
      persist();
      markDirty();
    }
  }, 380);
}

canvas.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  const point = canvasPoint(event);
  toolCursor = point;
  markDirty();
  ensureAudio();
  if (state.stage === 'design') handleDesignTap(point);
  else if (state.stage === 'cut') beginCut(event, point);
  else if (state.stage === 'assemble') beginAssemblyOnCanvas(event);
  else if (state.stage === 'lead') beginLead(event, point);
  else if (state.stage === 'solder') beginSolder(event,point);
});
canvas.addEventListener('pointermove', (event) => {
  const point = canvasPoint(event);
  toolCursor = point;
  if (state.stage === 'cut') { event.preventDefault(); moveCut(event, point); }
  else if (state.stage === 'lead') { event.preventDefault(); moveLead(event, point); }
  else if (state.stage === 'assemble') moveAssemblyDrag(event);
  else if (state.stage === 'solder' && solderGesture.active && event.pointerId===solderGesture.pointerId) solderGesture.point=point;
  markDirty();
});
canvas.addEventListener('pointerup', (event) => { endCut(event); endLead(event); endAssemblyDrag(event); endSolder(event); toolCursor = null; markDirty(); });
canvas.addEventListener('pointercancel', (event) => { endCut(event); endLead(event); endAssemblyDrag(event); endSolder(event); toolCursor = null; markDirty(); });
window.addEventListener('pointermove', event => { if(assembleDrag.active) moveAssemblyDrag(event); });
window.addEventListener('pointerup', event => { if(assembleDrag.active) endAssemblyDrag(event); });
window.addEventListener('pointercancel', event => { if(assembleDrag.active) endAssemblyDrag(event); });
canvas.addEventListener('pointerleave', () => { if (!cutGesture.active) { toolCursor = null; markDirty(); } });
canvas.addEventListener('lostpointercapture', (event) => endCut(event));

swatches.forEach((button, index) => button.addEventListener('click', () => {
  state.selectedColor = index;
  tone('tap');
  haptic(4);
  updateControls();
  persist();
}));

motifButton.addEventListener('click', () => {
  state.motif = (state.motif + 1) % MOTIFS.length;
  tone('tap');
  haptic(5);
  updateControls();
  persist();
  markDirty();
});

soundToggle.addEventListener('click', () => {
  state.sound = !state.sound;
  if (state.sound) tone('tap');
  updateControls();
  persist();
});

startCutButton.addEventListener('click', () => {
  tone('tap');
  state.cutIndex = state.cutDone.findIndex((done) => !done);
  if (state.cutIndex < 0) state.cutIndex = 0;
  setStage(state.cutDone.every(Boolean) ? 'assemble' : 'cut');
});

leadButton.addEventListener('click', () => {
  if (!state.assembled.every(Boolean)) return;
  tone('glass');
  haptic(10);
  setStage('lead');
});

revealButton.addEventListener('click', () => {
  if (!state.soldered.every(Boolean)) return;
  state.finished = true;
  tone('reveal');
  haptic([10, 30, 18]);
  setStage('reveal');
});

sunSlider.addEventListener('input', () => {
  state.sun = Number(sunSlider.value);
  persist();
  markDirty();
});

newProjectButton.addEventListener('click', () => {
  tone('tap');
  resetDialog.showModal();
});
cancelReset.addEventListener('click', () => resetDialog.close());
confirmReset.addEventListener('click', () => {
  state = defaultState();
  resetDialog.close();
  updateControls();
  setStage('design');
  showToast('Новый картон закреплён на столе.');
});
resetDialog.addEventListener('click', (event) => {
  if (event.target === resetDialog) resetDialog.close();
});

window.addEventListener('resize', () => { markDirty(); });
window.addEventListener('orientationchange', () => { window.setTimeout(markDirty, 80); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist();
  else markDirty();
});
window.addEventListener('pagehide', persist);

function normalizeStageFromProgress() {
  // Stored state may come from an interrupted transition; never trap the user.
  if (state.stage === 'cut' && state.cutDone.every(Boolean)) state.stage = 'assemble';
  if (state.stage === 'assemble' && !state.cutDone.every(Boolean)) state.stage = 'cut';
  if (state.stage === 'lead' && !state.assembled.every(Boolean)) state.stage = 'assemble';
  if (state.stage === 'solder' && !state.assembled.every(Boolean)) state.stage = 'assemble';
  if (state.stage === 'solder' && !state.leadProgress.every(v=>v>=.995)) state.stage='lead';
  if (state.stage === 'reveal' && !state.soldered.every(Boolean)) state.stage = 'solder';
}

normalizeStageFromProgress();
updateControls();
setStage(state.stage);
publishTestState();
requestAnimationFrame(animationLoop);
