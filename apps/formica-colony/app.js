import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import {
  createWorld, updateWorld, getStats, getDiagnostics, inspectAt,
  serializeWorld, restoreWorld, VIEW, DAY_SECONDS
} from './sim.js';
import { WorldRenderer } from './render.js';

installMobileRuntime();

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const SAVE = 'pocket-works:formica-colony:save';
const SET = 'pocket-works:formica-colony:settings';
const VERSION = '1.1.0';

const canvas = $('#worldCanvas');
const renderer = new WorldRenderer(canvas);
const ui = {
  start: $('#startScreen'), cont: $('#continueButton'), newBtn: $('#newButton'), top: $('#topbar'), tools: $('#observerTools'),
  badge: $('#surfaceBadge'), workers: $('#workersValue'), brood: $('#broodValue'), food: $('#foodValue'), day: $('#dayValue'),
  pauseBtn: $('#pauseButton'), pause: $('#pauseLayer'), resume: $('#resumeButton'), sound: $('#soundToggle'), reset: $('#resetButton'), saveNote: $('#saveNote'),
  speeds: $$('[data-speed]'), viewBtn: $('#viewButton'), viewLabel: $('#viewLabel'), historyBtn: $('#historyButton'), history: $('#historyLayer'),
  historyClose: $('#historyClose'), historyList: $('#historyList'), legend: $('#legend'), inspector: $('#inspector'), kicker: $('#inspectKicker'),
  title: $('#inspectTitle'), body: $('#inspectBody'), follow: $('#followButton'), inspectClose: $('#inspectClose'), confirm: $('#confirmLayer'),
  confirmCancel: $('#confirmCancel'), confirmReset: $('#confirmReset'), extinct: $('#extinctLayer'), extinctStats: $('#extinctStats'), extinctNew: $('#extinctNew'), toast: $('#toast')
};

let settings = loadSettings();
let world = null;
let paused = true;
let speed = 1;
let view = VIEW.NORMAL;
let selection = null;
let following = false;
let lastFrame = performance.now();
let lastUi = 0;
let lastSave = 0;
let toastTimer = 0;
let historyMark = '';
let saveStatus = 'idle';
let saveBytes = 0;
let saveError = '';
let previousSignals = { excavated: 0, births: 0, predatorsKilled: 0 };
const camera = { x: 548, y: 560, zoom: 0.82 };

function loadSettings() {
  try { return Object.assign({ sound: true }, JSON.parse(localStorage.getItem(SET) || '{}')); }
  catch { return { sound: true }; }
}
function saveSettings() {
  try { localStorage.setItem(SET, JSON.stringify(settings)); } catch { /* non-critical */ }
}
function hasSave() {
  try { return Boolean(localStorage.getItem(SAVE)); } catch { return false; }
}

class Sound {
  constructor() { this.ctx = null; }
  unlock() {
    if (!settings.sound) return;
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return;
    if (!this.ctx) this.ctx = new A();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  tone(f = 180, d = 0.04, gain = 0.012, type = 'sine') {
    if (!settings.sound || !this.ctx) return;
    const n = this.ctx.currentTime, o = this.ctx.createOscillator(), a = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, n);
    o.frequency.exponentialRampToValueAtTime(Math.max(50, f * 0.75), n + d);
    a.gain.setValueAtTime(gain, n);
    a.gain.exponentialRampToValueAtTime(0.0001, n + d);
    o.connect(a).connect(this.ctx.destination);
    o.start(n); o.stop(n + d + 0.01);
  }
  event(kind) {
    if (kind === 'dig') this.tone(142, 0.03, 0.008, 'triangle');
    else if (kind === 'birth') this.tone(325, 0.075, 0.012, 'sine');
    else if (kind === 'hunt') this.tone(94, 0.06, 0.014, 'square');
  }
}
const audio = new Sound();

function updateStart() {
  const saved = hasSave();
  ui.cont.hidden = !saved;
  ui.newBtn.querySelector('small').textContent = saved ? 'заменить сохранённую колонию' : 'королева + 9 рабочих';
}

function resetCamera() {
  camera.x = 548;
  camera.y = 560;
  camera.zoom = Math.max(0.76, Math.min(0.88, renderer.width / 520));
  clampCamera();
}

function save() {
  if (!world) return false;
  try {
    const text = JSON.stringify(serializeWorld(world));
    localStorage.setItem(SAVE, text);
    const verify = localStorage.getItem(SAVE);
    if (!verify || verify.length !== text.length) throw new Error('save verification failed');
    saveStatus = 'ok'; saveBytes = text.length; saveError = ''; lastSave = performance.now();
    if (ui.saveNote) ui.saveNote.textContent = `Сохранено локально · ${Math.ceil(saveBytes / 1024)} КБ`;
    publishTestState();
    return true;
  } catch (error) {
    console.error(error);
    saveStatus = 'error'; saveError = String(error?.message || error);
    if (ui.saveNote) ui.saveNote.textContent = 'Не удалось сохранить локально';
    toast('Ошибка локального сохранения');
    publishTestState();
    return false;
  }
}

function startNew() {
  world = createWorld();
  selection = null; following = false; paused = false; speed = 1; view = VIEW.NORMAL;
  previousSignals = { ...world.stats };
  resetCamera();
  enterSimulation();
  save();
  toast('Колония основана');
}

function continueSaved() {
  try {
    const text = localStorage.getItem(SAVE);
    if (!text) throw new Error('No save found');
    world = restoreWorld(JSON.parse(text));
    selection = null; following = false; paused = false; speed = 1; view = VIEW.NORMAL;
    previousSignals = { ...world.stats };
    resetCamera();
    enterSimulation();
    save();
  } catch (error) {
    console.error(error);
    try { localStorage.removeItem(SAVE); } catch { /* ignore */ }
    startNew();
    toast('Сохранение повреждено — создана новая колония');
  }
}

function enterSimulation() {
  document.body.dataset.mode = 'simulation';
  ui.start.hidden = true; ui.top.hidden = false; ui.tools.hidden = false; ui.badge.hidden = false;
  ui.pause.hidden = true; ui.confirm.hidden = true; ui.extinct.hidden = true;
  setSpeed(speed); setView(view); refresh(true); audio.unlock(); lastFrame = performance.now();
}

function setSpeed(v) {
  speed = v;
  for (const b of ui.speeds) {
    const on = Number(b.dataset.speed) === v;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
  }
  publishTestState();
}

const views = [VIEW.NORMAL, VIEW.PHEROMONE, VIEW.MOISTURE, VIEW.TEMPERATURE];
const viewNames = { [VIEW.NORMAL]: 'Срез', [VIEW.PHEROMONE]: 'Феромоны', [VIEW.MOISTURE]: 'Влага', [VIEW.TEMPERATURE]: 'Тепло' };
function setView(v) {
  view = v;
  ui.viewLabel.textContent = viewNames[v];
  ui.legend.dataset.view = v;
  ui.legend.hidden = v === VIEW.NORMAL;
  publishTestState();
}
function cycleView() { setView(views[(views.indexOf(view) + 1) % views.length]); }

function showPause() {
  if (!world) return;
  paused = true; save(); ui.pause.hidden = false;
  ui.sound.querySelector('strong').textContent = settings.sound ? 'Вкл' : 'Выкл';
  publishTestState();
}
function closePause() {
  ui.pause.hidden = true;
  if (!world?.colonyEnded) paused = false;
  audio.unlock(); lastFrame = performance.now(); publishTestState();
}
function openHistory() {
  if (!world) return;
  paused = true; renderHistory(true); ui.history.hidden = false; publishTestState();
}
function closeHistory() {
  ui.history.hidden = true;
  if (ui.pause.hidden && !world?.colonyEnded) paused = false;
  lastFrame = performance.now(); publishTestState();
}

function renderHistory(force = false) {
  if (!world) return;
  const mark = `${world.history.length}:${world.history.at(-1)?.t || 0}`;
  if (!force && mark === historyMark) return;
  historyMark = mark; ui.historyList.textContent = '';
  for (const item of [...world.history].reverse()) {
    const row = document.createElement('article'); row.className = `history-entry is-${item.kind}`;
    const d = document.createElement('span'); d.textContent = `ДЕНЬ ${item.day}`;
    const p = document.createElement('p'); p.textContent = item.text;
    row.append(d, p); ui.historyList.append(row);
  }
}

function stateName(s) {
  return ({ idle: 'исследует гнездо', forage: 'ищет пищу', returnFood: 'несёт пищу в кладовую', dig: 'снимает грунт', returnSoil: 'выносит грунт', attack: 'защищает тропу', feedBrood: 'кормит личинку', feedQueen: 'кормит королеву' })[s] || s;
}

function resolveSelection() {
  if (!world || !selection) return null;
  if (selection.kind === 'ant') return world.ants.find((x) => x.id === selection.id) || null;
  if (selection.kind === 'queen') return world.queen.alive ? world.queen : null;
  if (selection.kind === 'brood') return world.brood.find((x) => x.id === selection.id) || null;
  if (selection.kind === 'bug') return world.bugs.find((x) => x.id === selection.id && !x.dead) || null;
  return null;
}

function updateInspector() {
  const o = resolveSelection();
  if (!o) { selection = null; following = false; ui.inspector.hidden = true; return; }
  ui.inspector.hidden = false;
  if (selection.kind === 'ant') {
    ui.kicker.textContent = `WORKER #${o.id}`;
    ui.title.textContent = stateName(o.state);
    const carry = o.carry?.type === 'soil' ? ' · грунт' : o.carry?.type === 'food' ? ' · пища' : '';
    ui.body.textContent = `Возраст ${(o.age / DAY_SECONDS).toFixed(o.age < DAY_SECONDS ? 1 : 0)} дн. · энергия ${Math.round(o.energy * 100)}%${carry}`;
  } else if (selection.kind === 'queen') {
    ui.kicker.textContent = 'КОРОЛЕВА'; ui.title.textContent = 'репродуктивный центр';
    ui.body.textContent = `Энергия ${Math.round(o.energy * 100)}% · здоровье ${Math.round(o.hp * 100)}%`;
  } else if (selection.kind === 'brood') {
    ui.kicker.textContent = `РАСПЛОД #${o.id}`;
    ui.title.textContent = { egg: 'яйцо', larva: 'личинка', pupa: 'куколка' }[o.stage];
    ui.body.textContent = o.stage === 'larva' ? `Сытость ${Math.round(o.fed * 100)}% · стадия ${(o.age / DAY_SECONDS).toFixed(1)} дн.` : `Стадия ${(o.age / DAY_SECONDS).toFixed(1)} дн.`;
  } else {
    ui.kicker.textContent = o.species === 'beetle' ? 'ЖУК' : 'КЛЕЩ'; ui.title.textContent = 'поверхностная фауна';
    ui.body.textContent = `Здоровье ${Math.round(o.hp / o.maxHp * 100)}%`;
  }
  ui.follow.textContent = following ? 'Отпустить' : 'Следить';
}

function publishTestState() {
  const stats = world ? getStats(world) : null;
  const diagnostics = world ? getDiagnostics(world) : null;
  window.__FORMICA_TEST_STATE__ = {
    version: VERSION,
    phase: world ? (world.colonyEnded ? 'ended' : paused ? 'paused' : 'running') : 'menu',
    speed, view, saveStatus, saveBytes, saveError,
    stats, diagnostics,
    selected: selection?.kind || null,
    camera: { ...camera }
  };
}

function refresh(force = false) {
  if (!world) { publishTestState(); return; }
  const now = performance.now();
  if (!force && now - lastUi < 160) return;
  lastUi = now;
  const s = getStats(world);
  ui.workers.textContent = s.workers; ui.brood.textContent = s.brood; ui.food.textContent = s.food.toFixed(1); ui.day.textContent = s.day;
  ui.badge.textContent = `${s.season} · ${Math.round(world.weather.surfaceTemp)}°${world.weather.rain ? ' · дождь' : ''}`;
  updateInspector(); renderHistory(); publishTestState();

  if (world.stats.excavated > previousSignals.excavated) { audio.event('dig'); previousSignals.excavated = world.stats.excavated; }
  if (world.stats.births > previousSignals.births) { audio.event('birth'); previousSignals.births = world.stats.births; }
  if (world.stats.predatorsKilled > previousSignals.predatorsKilled) { audio.event('hunt'); previousSignals.predatorsKilled = world.stats.predatorsKilled; }

  if (world.colonyEnded && ui.extinct.hidden) {
    paused = true; save();
    ui.extinctStats.textContent = `${s.day} дней · ${world.stats.births} новых рабочих · ${world.stats.excavated} ячеек грунта`;
    ui.extinct.hidden = false;
  }
}

function toast(text) {
  ui.toast.textContent = text; ui.toast.classList.add('is-visible'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('is-visible'), 1700);
}

const points = new Map();
let gesture = { drag: false, moved: false, sx: 0, sy: 0, cx: 0, cy: 0, pinch: 0, pinchZoom: 0 };
function clampCamera() {
  const halfW = renderer.width / (2 * camera.zoom), halfH = renderer.height / (2 * camera.zoom);
  camera.x = Math.max(halfW - 110, Math.min(1120 - halfW + 110, camera.x));
  camera.y = Math.max(halfH - 120, Math.min(2450 - halfH + 110, camera.y));
}
function zoomAt(x, y, z) {
  const before = renderer.screenToWorld(camera, x, y);
  camera.zoom = Math.max(0.42, Math.min(2.5, z));
  const after = renderer.screenToWorld(camera, x, y);
  camera.x += before.x - after.x; camera.y += before.y - after.y; clampCamera();
}

canvas.addEventListener('pointerdown', (e) => {
  if (!world || paused) return;
  audio.unlock(); canvas.setPointerCapture?.(e.pointerId);
  points.set(e.pointerId, { x: e.clientX, y: e.clientY });
  gesture.moved = false; gesture.sx = e.clientX; gesture.sy = e.clientY; gesture.cx = camera.x; gesture.cy = camera.y;
  if (points.size === 1) gesture.drag = true;
  if (points.size === 2) {
    const [a, b] = [...points.values()]; gesture.pinch = Math.hypot(a.x - b.x, a.y - b.y); gesture.pinchZoom = camera.zoom; gesture.drag = false;
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!points.has(e.pointerId)) return;
  const p = points.get(e.pointerId); p.x = e.clientX; p.y = e.clientY;
  if (points.size === 1 && gesture.drag) {
    const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy;
    if (Math.hypot(dx, dy) > 5) { gesture.moved = true; following = false; }
    camera.x = gesture.cx - dx / camera.zoom; camera.y = gesture.cy - dy / camera.zoom; clampCamera();
  } else if (points.size >= 2) {
    const [a, b] = [...points.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (gesture.pinch > 0) {
      gesture.moved = true; following = false;
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, gesture.pinchZoom * d / gesture.pinch);
    }
  }
});
function pointerEnd(e) {
  const single = points.size === 1; points.delete(e.pointerId);
  if (single && !gesture.moved && world && !paused) {
    const r = canvas.getBoundingClientRect();
    const p = renderer.screenToWorld(camera, e.clientX - r.left, e.clientY - r.top);
    const hit = inspectAt(world, p.x, p.y, Math.max(15, 23 / camera.zoom));
    if (hit) { selection = { kind: hit.kind, id: hit.id }; following = false; updateInspector(); }
    else { selection = null; following = false; ui.inspector.hidden = true; }
    publishTestState();
  }
  if (points.size === 1) {
    const p = [...points.values()][0]; gesture.drag = true; gesture.sx = p.x; gesture.sy = p.y; gesture.cx = camera.x; gesture.cy = camera.y; gesture.moved = true;
  } else if (points.size === 0) { gesture.drag = false; gesture.pinch = 0; }
}
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);
canvas.addEventListener('wheel', (e) => {
  if (!world || paused) return;
  e.preventDefault(); const r = canvas.getBoundingClientRect();
  zoomAt(e.clientX - r.left, e.clientY - r.top, camera.zoom * Math.exp(-e.deltaY * 0.0012)); following = false;
}, { passive: false });

ui.cont.addEventListener('click', () => { audio.unlock(); continueSaved(); });
ui.newBtn.addEventListener('click', () => { audio.unlock(); if (hasSave()) ui.confirm.hidden = false; else startNew(); });
ui.pauseBtn.addEventListener('click', showPause);
ui.pause.querySelector('.sheet-backdrop').addEventListener('click', closePause);
ui.resume.addEventListener('click', closePause);
ui.sound.addEventListener('click', () => {
  settings.sound = !settings.sound; saveSettings(); ui.sound.querySelector('strong').textContent = settings.sound ? 'Вкл' : 'Выкл'; if (settings.sound) audio.unlock();
});
ui.reset.addEventListener('click', () => { ui.pause.hidden = true; ui.confirm.hidden = false; });
ui.confirmCancel.addEventListener('click', () => { ui.confirm.hidden = true; if (world && ui.start.hidden) ui.pause.hidden = false; });
ui.confirmReset.addEventListener('click', () => { try { localStorage.removeItem(SAVE); } catch { /* ignore */ } ui.confirm.hidden = true; startNew(); });
ui.extinctNew.addEventListener('click', () => { ui.extinct.hidden = true; ui.confirm.hidden = false; });
ui.speeds.forEach((b) => b.addEventListener('click', () => { setSpeed(Number(b.dataset.speed)); audio.unlock(); }));
ui.viewBtn.addEventListener('click', cycleView);
ui.historyBtn.addEventListener('click', openHistory);
ui.historyClose.addEventListener('click', closeHistory);
ui.history.querySelector('.sheet-backdrop').addEventListener('click', closeHistory);
ui.inspectClose.addEventListener('click', () => { selection = null; following = false; ui.inspector.hidden = true; publishTestState(); });
ui.follow.addEventListener('click', () => { following = !following; updateInspector(); publishTestState(); });

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { save(); paused = true; }
  else if (world && ui.pause.hidden && ui.history.hidden && !world.colonyEnded) { paused = false; lastFrame = performance.now(); }
  publishTestState();
});
window.addEventListener('pagehide', save);
window.addEventListener('resize', () => { renderer.resize(); clampCamera(); });

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0); lastFrame = now;
  if (world && !paused) {
    let remain = dt * speed, guard = 0;
    while (remain > 0 && guard++ < 20) {
      const step = Math.min(0.05, remain); updateWorld(world, step); remain -= step;
    }
  }
  if (world) {
    const target = following ? resolveSelection() : null;
    if (target) {
      const k = Math.min(1, dt * 5.3); camera.x += (target.x - camera.x) * k; camera.y += (target.y - camera.y) * k; clampCamera();
    }
    renderer.draw(world, camera, selection, view, now);
    refresh();
    if (now - lastSave > 9000 && !paused) save();
  }
}

updateStart();
document.body.dataset.mode = 'menu';
ui.sound.querySelector('strong').textContent = settings.sound ? 'Вкл' : 'Выкл';
publishTestState();
requestAnimationFrame(frame);
