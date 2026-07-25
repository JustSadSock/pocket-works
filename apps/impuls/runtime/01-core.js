const canvas = document.querySelector('#world');
const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
const workspace = document.querySelector('#workspace');
const bodyCountEl = document.querySelector('#bodyCount');
const constraintCountEl = document.querySelector('#constraintCount');
const pauseButton = document.querySelector('#pauseButton');
const menuButton = document.querySelector('#menuButton');
const toolStrip = document.querySelector('#toolStrip');
const materialButton = document.querySelector('#materialButton');
const materialSwatch = document.querySelector('#materialSwatch');
const materialName = document.querySelector('#materialName');
const undoButton = document.querySelector('#undoButton');
const stressButton = document.querySelector('#stressButton');
const clearButton = document.querySelector('#clearButton');
const inspector = document.querySelector('#inspector');
const materialChip = document.querySelector('#materialChip');
const pinButton = document.querySelector('#pinButton');
const duplicateButton = document.querySelector('#duplicateButton');
const deleteButton = document.querySelector('#deleteButton');
const fieldNote = document.querySelector('#fieldNote');
const gestureHint = document.querySelector('#gestureHint');
const linkBanner = document.querySelector('#linkBanner');
const linkText = document.querySelector('#linkText');
const cancelLink = document.querySelector('#cancelLink');
const backdrop = document.querySelector('#backdrop');
const sheet = document.querySelector('#sheet');
const sheetKicker = document.querySelector('#sheetKicker');
const sheetTitle = document.querySelector('#sheetTitle');
const sheetBody = document.querySelector('#sheetBody');
const closeSheetButton = document.querySelector('#closeSheet');
const intro = document.querySelector('#intro');
const introStart = document.querySelector('#introStart');
const toastEl = document.querySelector('#toast');
const importInput = document.querySelector('#importInput');

const STORAGE_KEY = 'pocket-works:impuls:state:v1';
const PREFS_KEY = 'pocket-works:impuls:prefs:v1';
const INTRO_KEY = 'pocket-works:impuls:intro:v1';
const MAX_BODIES = 150;
const TAU = Math.PI * 2;

const MATERIALS = {
  wood: { name: 'ДЕРЕВО', color: '#b98547', edge: '#624126', density: .72, restitution: .22, friction: .62, gravityScale: 1 },
  steel: { name: 'СТАЛЬ', color: '#6c7a7c', edge: '#2b3436', density: 2.4, restitution: .08, friction: .42, gravityScale: 1 },
  rubber: { name: 'РЕЗИНА', color: '#d46040', edge: '#73301f', density: .9, restitution: .82, friction: .88, gravityScale: 1 },
  ice: { name: 'ЛЁД', color: '#b7d8db', edge: '#4b7a80', density: .78, restitution: .18, friction: .035, gravityScale: 1 },
  foam: { name: 'ПЕНА', color: '#e9d58a', edge: '#8a773c', density: .22, restitution: .48, friction: .5, gravityScale: .34 }
};
const MATERIAL_KEYS = Object.keys(MATERIALS);

const state = {
  bodies: [],
  constraints: [],
  fields: [],
  bursts: [],
  tool: 'hand',
  material: 'wood',
  fieldPolarity: 1,
  paused: false,
  speed: 1,
  gravity: 980,
  stress: false,
  sound: true,
  haptics: true,
  selectedId: null,
  pointer: null,
  preview: null,
  linkStart: null,
  history: [],
  nextId: 1,
  worldWidth: 0,
  worldHeight: 0,
  lastTime: performance.now(),
  accumulator: 0,
  saveTimer: 0,
  audio: null,
  collisionSoundAt: 0,
  introScene: 'bridge',
  initialised: false,
  pausedByVisibility: false
};

const clone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const len = (x, y) => Math.hypot(x, y);
const dot = (ax, ay, bx, by) => ax * bx + ay * by;
const normalize = (x, y) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l, length: l }; };
const rotate = (x, y, angle) => ({ x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) });
const id = prefix => `${prefix}-${state.nextId++}`;

function showToast(message, duration = 1500) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toastEl.hidden = true; }, duration);
}

function pulseHaptic(pattern = 9) {
  if (state.haptics && navigator.vibrate) navigator.vibrate(pattern);
}

function ensureAudio() {
  if (!state.sound) return null;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  if (!state.audio) state.audio = new AudioCtor();
  if (state.audio.state === 'suspended') state.audio.resume().catch(() => {});
  return state.audio;
}

function sound(type = 'tap', strength = .5) {
  const audio = ensureAudio();
  if (!audio) return;
  const now = audio.currentTime;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const presets = {
    tap: [170, .025, 'square'],
    spawn: [260, .045, 'triangle'],
    link: [340, .07, 'sine'],
    blast: [75, .16, 'sawtooth'],
    collision: [110 + strength * 130, .025, 'triangle']
  };
  const [frequency, duration, wave] = presets[type] || presets.tap;
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(frequency, now);
  if (type === 'blast') oscillator.frequency.exponentialRampToValueAtTime(34, now + duration);
  gain.gain.setValueAtTime(Math.min(.09, .025 + strength * .04), now);
  gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function bodyMass(shape, geometry, materialKey) {
  const density = MATERIALS[materialKey].density;
  const area = shape === 'circle' ? Math.PI * geometry.r * geometry.r : geometry.w * geometry.h;
  return Math.max(.2, area * density * .0012);
}

function createBody(shape, x, y, options = {}) {
  const material = options.material || state.material;
  const geometry = shape === 'circle'
    ? { r: options.r || 22 }
    : { w: options.w || 46, h: options.h || 34 };
  const mass = bodyMass(shape, geometry, material);
  const inertia = shape === 'circle'
    ? .5 * mass * geometry.r * geometry.r
    : mass * (geometry.w * geometry.w + geometry.h * geometry.h) / 12;
  const pinned = Boolean(options.pinned);
  return {
    id: options.id || id('b'),
    shape,
    x, y,
    vx: options.vx || 0,
    vy: options.vy || 0,
    angle: options.angle || 0,
    av: options.av || 0,
    r: geometry.r || 0,
    w: geometry.w || 0,
    h: geometry.h || 0,
    material,
    mass,
    invMass: pinned ? 0 : 1 / mass,
    inertia,
    invInertia: pinned ? 0 : 1 / inertia,
    pinned,
    sleeping: false,
    customGravity: options.customGravity ?? null
  };
}

function refreshBodyPhysics(body) {
  const mass = bodyMass(body.shape, body, body.material);
  const inertia = body.shape === 'circle'
    ? .5 * mass * body.r * body.r
    : mass * (body.w * body.w + body.h * body.h) / 12;
  body.mass = mass;
  body.inertia = inertia;
  body.invMass = body.pinned ? 0 : 1 / mass;
  body.invInertia = body.pinned ? 0 : 1 / inertia;
}

function bodyById(bodyId) {
  return state.bodies.find(body => body.id === bodyId) || null;
}

function pointInBody(body, x, y, margin = 0) {
  if (body.shape === 'circle') return Math.hypot(x - body.x, y - body.y) <= body.r + margin;
  const local = rotate(x - body.x, y - body.y, -body.angle);
  return Math.abs(local.x) <= body.w / 2 + margin && Math.abs(local.y) <= body.h / 2 + margin;
}

function findBodyAt(x, y, margin = 4) {
  for (let index = state.bodies.length - 1; index >= 0; index--) {
    if (pointInBody(state.bodies[index], x, y, margin)) return state.bodies[index];
  }
  return null;
}

function findFieldAt(x, y) {
  for (let index = state.fields.length - 1; index >= 0; index--) {
    const field = state.fields[index];
    if (Math.hypot(x - field.x, y - field.y) <= Math.max(24, field.radius * .22)) return field;
  }
  return null;
}

function pushHistory() {
  state.history.push(snapshotWorld());
  if (state.history.length > 30) state.history.shift();
  updateControls();
}

function snapshotWorld() {
  return {
    bodies: clone(state.bodies),
    constraints: clone(state.constraints),
    fields: clone(state.fields),
    nextId: state.nextId,
    worldWidth: state.worldWidth,
    worldHeight: state.worldHeight
  };
}

function restoreWorld(snapshot, rescale = true) {
  if (!snapshot || !Array.isArray(snapshot.bodies)) return false;
  const sx = rescale && snapshot.worldWidth ? state.worldWidth / snapshot.worldWidth : 1;
  const sy = rescale && snapshot.worldHeight ? state.worldHeight / snapshot.worldHeight : 1;
  state.bodies = clone(snapshot.bodies).map(body => ({ ...body, x: body.x * sx, y: body.y * sy, vx: body.vx * sx, vy: body.vy * sy }));
  state.constraints = clone(snapshot.constraints || []).map(constraint => ({
    ...constraint,
    rest: constraint.rest * Math.min(sx, sy),
    ax: constraint.ax == null ? null : constraint.ax * sx,
    ay: constraint.ay == null ? null : constraint.ay * sy,
    bx: constraint.bx == null ? null : constraint.bx * sx,
    by: constraint.by == null ? null : constraint.by * sy
  }));
  state.fields = clone(snapshot.fields || []).map(field => ({ ...field, x: field.x * sx, y: field.y * sy, radius: field.radius * Math.min(sx, sy) }));
  state.nextId = Math.max(snapshot.nextId || 1, state.bodies.length + state.constraints.length + state.fields.length + 1);
  state.selectedId = null;
  updateInspector();
  updateStats();
  scheduleSave();
  return true;
}

function scheduleSave() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveWorld, 450);
}

function saveWorld() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotWorld()));
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      material: state.material,
      gravity: state.gravity,
      speed: state.speed,
      stress: state.stress,
      sound: state.sound,
      haptics: state.haptics,
      fieldPolarity: state.fieldPolarity
    }));
  } catch (error) {
    console.warn('Не удалось сохранить мир', error);
  }
}

function loadSavedWorld() {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    if (prefs) {
      state.material = MATERIALS[prefs.material] ? prefs.material : 'wood';
      state.gravity = clamp(Number(prefs.gravity) || 980, -980, 1960);
      state.speed = [0.25, .5, 1, 2].includes(prefs.speed) ? prefs.speed : 1;
      state.stress = Boolean(prefs.stress);
      state.sound = prefs.sound !== false;
      state.haptics = prefs.haptics !== false;
      state.fieldPolarity = prefs.fieldPolarity === -1 ? -1 : 1;
    }
    const snapshot = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return snapshot && restoreWorld(snapshot, true);
  } catch (error) {
    console.warn('Повреждённое сохранение отброшено', error);
    return false;
  }
}

function updateMaterialUI() {
  const material = MATERIALS[state.material];
  materialName.textContent = material.name;
  materialSwatch.style.background = material.color;
  const selected = bodyById(state.selectedId);
  if (selected) {
    const selectedMaterial = MATERIALS[selected.material];
    materialChip.querySelector('i').style.background = selectedMaterial.color;
    materialChip.querySelector('span').textContent = selectedMaterial.name;
  }
}

function updateStats() {
  bodyCountEl.textContent = state.bodies.length;
  constraintCountEl.textContent = state.constraints.length;
}

function updateControls() {
  pauseButton.setAttribute('aria-pressed', String(state.paused));
  pauseButton.setAttribute('aria-label', state.paused ? 'Продолжить' : 'Пауза');
  stressButton.setAttribute('aria-pressed', String(state.stress));
  undoButton.disabled = state.history.length === 0;
  undoButton.style.opacity = state.history.length ? '1' : '.42';
  updateMaterialUI();
}

function updateInspector() {
  const body = bodyById(state.selectedId);
  inspector.hidden = !body;
  if (!body) return;
  updateMaterialUI();
  pinButton.style.background = body.pinned ? 'var(--blue)' : '';
  pinButton.style.color = body.pinned ? 'white' : '';
}

function setTool(tool, fromRepeatedTap = false) {
  if (tool === 'field' && state.tool === 'field' && fromRepeatedTap) {
    state.fieldPolarity *= -1;
    fieldNote.textContent = state.fieldPolarity > 0 ? 'ПОЛЕ: ПРИТЯЖЕНИЕ · НАЖМИ ЕЩЁ РАЗ ДЛЯ ОТТАЛКИВАНИЯ' : 'ПОЛЕ: ОТТАЛКИВАНИЕ · НАЖМИ ЕЩЁ РАЗ ДЛЯ ПРИТЯЖЕНИЯ';
    fieldNote.hidden = false;
    pulseHaptic();
    scheduleSave();
    return;
  }
  state.tool = tool;
  state.preview = null;
  state.pointer = null;
  state.linkStart = null;
  linkBanner.hidden = true;
  state.selectedId = null;
  updateInspector();
  [...toolStrip.querySelectorAll('.tool')].forEach(button => {
    const active = button.dataset.tool === tool;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const hints = {
    hand: 'ТАЩИ И БРОСАЙ ТЕЛА', circle: 'ПРОВЕДИ, ЧТОБЫ ЗАПУСТИТЬ ШАР', box: 'ПРОВЕДИ, ЧТОБЫ ЗАПУСТИТЬ БЛОК',
    wall: 'ПРОВЕДИ БАЛКУ', rope: 'СОЕДИНИ ДВЕ ТОЧКИ ТРОСОМ', spring: 'СОЕДИНИ ДВЕ ТОЧКИ ПРУЖИНОЙ',
    field: 'РАСТЯНИ РАДИУС ПОЛЯ', impulse: 'ПРОВЕДИ НАПРАВЛЕНИЕ УДАРА', erase: 'КОСНИСЬ, ЧТОБЫ СТЕРЕТЬ'
  };
  gestureHint.textContent = hints[tool];
  fieldNote.hidden = tool !== 'field';
  if (tool === 'field') fieldNote.textContent = state.fieldPolarity > 0 ? 'ПОЛЕ: ПРИТЯЖЕНИЕ · НАЖМИ ЕЩЁ РАЗ ДЛЯ ОТТАЛКИВАНИЯ' : 'ПОЛЕ: ОТТАЛКИВАНИЕ · НАЖМИ ЕЩЁ РАЗ ДЛЯ ПРИТЯЖЕНИЯ';
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

