import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';

installMobileRuntime();

const KEY = 'pocket-works:ottisk:state:v1';
const PRINTS = 8;
const LAYERS = 3;
const TAU = Math.PI * 2;
const PALETTES = [
  ['#eee6d4', '#ef5b45', '#127e91', '#e5b83f'],
  ['#e9e3d6', '#ed3b68', '#2445a5', '#66a35c'],
  ['#ede6d8', '#e85136', '#087d70', '#5965a8'],
  ['#eee5d6', '#8f3c69', '#d68e2f', '#1b6d73'],
  ['#efeadc', '#ef4b32', '#708d19', '#2d64ae']
];

const $ = (selector) => document.querySelector(selector);
const el = {
  room: $('#press-room'), canvas: $('#press-canvas'), intro: $('#intro-panel'), edition: $('#edition-panel'), fatal: $('#fatal-error'),
  start: $('#start-button'), next: $('#next-edition-button'), reset: $('#reset-progress-button'), sound: $('#sound-toggle'),
  layer: $('#layer-label'), print: $('#print-label'), combo: $('#combo-label'), editionLabel: $('#edition-label'), palette: $('#palette-label'), best: $('#best-label'),
  hint: $('#hint-copy'), feedback: $('#feedback'), feedbackTitle: $('#feedback-title'), feedbackCopy: $('#feedback-copy'),
  editionTitle: $('#edition-title'), editionScore: $('#edition-score'), editionSummary: $('#edition-summary')
};
const ctx = el.canvas?.getContext?.('2d', { alpha: false });
if (!ctx) { el.fatal.hidden = false; throw new Error('Canvas 2D unavailable'); }

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let view = { w: 1, h: 1, dpr: 1 };
let raf = 0;
let audio = null;
let transition = 0;
let feedbackTimer = 0;

const blankSession = () => ({ active: false, finished: false, print: 0, layer: 0, score: 0, combo: 1, bestCombo: 1, seed: seed(), locked: [], flash: 0, particles: [] });
let state = load();

function seed() { return Math.floor(Math.random() * 0xffffffff) >>> 0; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function integer(v, a, b) { return clamp(Number.isFinite(v) ? Math.round(v) : a, a, b); }
function rng(value) {
  let n = value >>> 0;
  return () => { n += 0x6d2b79f5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function cleanSession(raw) {
  if (!raw || typeof raw !== 'object') return blankSession();
  return {
    active: Boolean(raw.active), finished: Boolean(raw.finished), print: integer(raw.print, 0, PRINTS), layer: integer(raw.layer, 0, LAYERS - 1),
    score: Number.isFinite(raw.score) ? Math.max(0, Math.round(raw.score)) : 0, combo: integer(raw.combo, 1, 99), bestCombo: integer(raw.bestCombo, 1, 99),
    seed: Number.isFinite(raw.seed) ? raw.seed >>> 0 : seed(), locked: Array.isArray(raw.locked) ? raw.locked.slice(0, LAYERS).map((p) => ({
      x: Number.isFinite(p?.x) ? p.x : 0, y: Number.isFinite(p?.y) ? p.y : 0, accuracy: integer(p?.accuracy, 0, 100)
    })) : [], flash: 0, particles: []
  };
}
function load() {
  const fallback = { sound: true, best: 0, editions: 0, palette: 0, session: blankSession() };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    return raw && typeof raw === 'object' ? {
      sound: raw.sound !== false, best: Number.isFinite(raw.best) ? Math.max(0, raw.best) : 0,
      editions: Number.isFinite(raw.editions) ? Math.max(0, raw.editions) : 0,
      palette: Number.isFinite(raw.palette) ? Math.max(0, raw.palette) % PALETTES.length : 0,
      session: cleanSession(raw.session)
    } : fallback;
  } catch { return fallback; }
}
function save() {
  localStorage.setItem(KEY, JSON.stringify({ ...state, session: { ...state.session, flash: 0, particles: [] } }));
}
function colors() { return PALETTES[state.palette % PALETTES.length]; }

function resize() {
  const rect = el.room.getBoundingClientRect();
  view = { w: Math.max(1, rect.width), h: Math.max(1, rect.height), dpr: Math.min(2, devicePixelRatio || 1) };
  el.canvas.width = Math.round(view.w * view.dpr);
  el.canvas.height = Math.round(view.h * view.dpr);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
}
function motion(layer, time) {
  const speed = [0.00115, 0.00143, 0.00172][layer];
  const amp = Math.min(view.w * .26, 108) * (reduced ? .45 : 1);
  const vert = Math.min(view.h * .045, 28) * (reduced ? .45 : 1);
  const phase = state.session.seed * .000001 + layer * 2.14;
  return { x: Math.sin(time * speed + phase) * amp, y: Math.cos(time * speed * .73 + phase * 1.7) * vert };
}

function draw(time) {
  const [paper, ...inks] = colors();
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = paper; ctx.fillRect(0, 0, view.w, view.h);
  fibres(time);
  const cx = view.w * .5, cy = view.h * .51, scale = clamp(Math.min(view.w / 390, view.h / 760), .78, 1.32);
  ctx.save(); ctx.translate(cx, cy); ctx.globalCompositeOperation = 'multiply';
  for (let layer = 0; layer < LAYERS; layer += 1) {
    const locked = state.session.locked[layer];
    const offset = locked || (layer === state.session.layer && state.session.active && !state.session.finished ? motion(layer, time) : { x: 0, y: 0 });
    const alpha = locked || layer < state.session.layer ? .82 : layer === state.session.layer ? .72 : .11;
    motif(layer, state.session.seed, offset.x, offset.y, scale, inks[layer], alpha);
  }
  ctx.restore(); registration(cx, cy, scale, time); particles();
  if (state.session.flash > 0) { ctx.fillStyle = `rgba(255,249,229,${state.session.flash * .38})`; ctx.fillRect(0, 0, view.w, view.h); state.session.flash = Math.max(0, state.session.flash - .055); }
}
function fibres(time) {
  const random = rng(912773); ctx.save(); ctx.globalAlpha = .075; ctx.strokeStyle = '#4f493e'; ctx.lineWidth = .55;
  const drift = reduced ? 0 : time * .003 % 18;
  for (let i = 0; i < 42; i += 1) { const y = random() * view.h, x = (random() * view.w + drift) % view.w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 12 + random() * 38, y + (random() - .5) * 2); ctx.stroke(); }
  ctx.restore();
}
function motif(layer, sourceSeed, ox, oy, scale, color, alpha) {
  const random = rng((sourceSeed + layer * 92821) >>> 0), mode = sourceSeed % 5;
  ctx.save(); ctx.translate(ox, oy); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineCap = 'square';
  if (mode === 0) {
    ctx.lineWidth = (18 - layer * 3) * scale; ctx.beginPath(); ctx.arc(0, 0, (70 + layer * 17) * scale, (-.85 + layer * .35) * Math.PI, (.88 + layer * .32) * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc((layer - 1) * 24 * scale, (layer - 1) * -16 * scale, (34 + random() * 18) * scale, 0, TAU); ctx.fill();
  } else if (mode === 1) {
    for (let i = 0; i < 4 + layer; i += 1) { const w = (24 + random() * 28) * scale, h = (130 - i * 12 + random() * 28) * scale; ctx.fillRect((-100 + i * 44 + layer * 8) * scale, -h * .5 + ((i % 2 ? 18 : -12) + layer * 7) * scale, w, h); }
  } else if (mode === 2) {
    const petals = 5 + layer; ctx.save(); ctx.rotate(layer * .44);
    for (let i = 0; i < petals; i += 1) { ctx.save(); ctx.rotate(i / petals * TAU); ctx.beginPath(); ctx.ellipse(0, -66 * scale, (34 + random() * 12) * scale, (63 + random() * 24) * scale, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    ctx.restore(); ctx.beginPath(); ctx.arc(0, 0, (22 + layer * 7) * scale, 0, TAU); ctx.fill();
  } else if (mode === 3) {
    const step = (31 + layer * 7) * scale; ctx.lineWidth = (9 - layer) * scale; ctx.save(); ctx.rotate(-.19 + layer * .18);
    for (let i = -4; i <= 4; i += 1) { ctx.beginPath(); ctx.moveTo(-130 * scale, i * step); ctx.lineTo(130 * scale, i * step); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i * step, -130 * scale); ctx.lineTo(i * step, 130 * scale); ctx.stroke(); }
    ctx.restore();
  } else {
    const side = (150 - layer * 18) * scale; ctx.save(); ctx.rotate((layer - 1) * .18); ctx.fillRect(-side / 2, -side / 2, side, side); ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc((layer - 1) * 16 * scale, 0, (30 + random() * 25) * scale, 0, TAU); ctx.fill(); ctx.restore(); ctx.globalCompositeOperation = 'multiply';
  }
  ctx.globalAlpha *= .28;
  for (let i = 0; i < 46; i += 1) { const a = random() * TAU, d = Math.sqrt(random()) * (95 + layer * 14) * scale; ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, (2.2 + layer * .55) * scale * (.45 + random()), 0, TAU); ctx.fill(); }
  ctx.restore();
}
function registration(x, y, scale, time) {
  const pulse = state.session.active ? 1 + Math.sin(time * .004) * .04 : 1;
  ctx.save(); ctx.translate(x, y); ctx.scale(pulse, pulse); ctx.strokeStyle = 'rgba(23,60,66,.76)'; ctx.fillStyle = 'rgba(238,230,212,.68)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, 0, 38 * scale, 0, TAU); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-55 * scale, 0); ctx.lineTo(55 * scale, 0); ctx.moveTo(0, -55 * scale); ctx.lineTo(0, 55 * scale); ctx.stroke(); ctx.fillStyle = '#173c42'; ctx.fillRect(-3 * scale, -3 * scale, 6 * scale, 6 * scale); ctx.restore();
}
function burst(color, power) {
  const count = reduced ? 4 : 10 + Math.round(power / 12);
  for (let i = 0; i < count; i += 1) { const a = Math.random() * TAU, s = 1 + Math.random() * (1.6 + power / 45); state.session.particles.push({ x: view.w * .5, y: view.h * .51, vx: Math.cos(a) * s, vy: Math.sin(a) * s - .4, life: 1, size: 2 + Math.random() * 8, color }); }
}
function particles() {
  for (let i = state.session.particles.length - 1; i >= 0; i -= 1) { const p = state.session.particles[i]; p.x += p.vx; p.y += p.vy; p.vy += .025; p.life -= .024; if (p.life <= 0) { state.session.particles.splice(i, 1); continue; } ctx.globalAlpha = p.life * .76; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
}

function lockLayer() {
  if (!state.session.active || state.session.finished || transition) return;
  const layer = state.session.layer, offset = motion(layer, performance.now()), max = Math.min(view.w * .28, 112);
  const accuracy = integer(100 - Math.hypot(offset.x, offset.y) / max * 92, 0, 100);
  state.session.locked[layer] = { ...offset, accuracy }; state.session.flash = Math.max(state.session.flash, accuracy / 190);
  el.room.classList.remove('is-locked'); void el.room.offsetWidth; el.room.classList.add('is-locked');
  burst(colors()[layer + 1], accuracy); layerSound(layer, accuracy); vibrate(accuracy >= 88 ? [10, 20, 12] : 8); feedback(accuracy);
  if (layer < LAYERS - 1) { state.session.layer += 1; el.hint.textContent = `Лови ${state.session.layer + 1}-й цвет`; save(); update(); return; }
  finishPrint();
}
function feedback(accuracy) {
  clearTimeout(feedbackTimer);
  el.feedbackTitle.textContent = accuracy >= 94 ? 'В РЕГИСТР' : accuracy >= 82 ? 'ТОЧНО' : accuracy >= 62 ? 'ЖИВОЙ БРАК' : 'СЪЕХАЛО';
  el.feedbackCopy.textContent = `${accuracy}% совмещения`; el.feedback.hidden = false;
  feedbackTimer = setTimeout(() => { el.feedback.hidden = true; }, 680);
}
function finishPrint() {
  const average = state.session.locked.reduce((sum, p) => sum + p.accuracy, 0) / LAYERS;
  state.session.combo = average >= 78 ? state.session.combo + 1 : 1; state.session.bestCombo = Math.max(state.session.bestCombo, state.session.combo);
  state.session.score += Math.round(average * (1 + Math.max(0, state.session.combo - 1) * .16)); state.session.flash = 1;
  el.room.classList.add('is-printing'); printSound(average); vibrate(average >= 88 ? [15, 24, 18] : 14); update(); save();
  transition = setTimeout(() => { el.room.classList.remove('is-printing'); transition = 0; state.session.print += 1; state.session.print >= PRINTS ? finishEdition() : nextPrint(); }, reduced ? 150 : 760);
}
function nextPrint() { state.session.layer = 0; state.session.locked = []; state.session.seed = seed(); el.hint.textContent = 'Тапни, когда метки совпадут'; save(); update(); }
function finishEdition() {
  state.session.active = false; state.session.finished = true; state.editions += 1; state.best = Math.max(state.best, state.session.score);
  const unlocked = Math.min(PALETTES.length, 1 + Math.floor(state.editions / 2)); state.palette = (state.editions - 1) % unlocked; save(); update();
  const score = state.session.score; el.editionTitle.textContent = score >= 900 ? 'ТИРАЖ БЕЗ СТЫДА' : score >= 700 ? 'ХОРОШАЯ РЕГИСТРАЦИЯ' : 'КРАСИВЫЙ БРАК';
  el.editionScore.textContent = score; el.editionSummary.textContent = `${PRINTS} оттисков. Лучшая серия ×${state.session.bestCombo}. Рекорд ${state.best}.`; el.edition.hidden = false; editionSound(score);
}
function startEdition() { clearTimeout(transition); transition = 0; state.session = blankSession(); state.session.active = true; el.intro.hidden = true; el.edition.hidden = true; el.room.classList.add('is-playing'); el.hint.textContent = 'Тапни, когда метки совпадут'; ensureAudio(); save(); update(); }
function resume() { state.session.active = true; state.session.finished = false; el.intro.hidden = true; el.edition.hidden = true; el.room.classList.add('is-playing'); save(); update(); }
function reset() {
  if (!confirm('Стереть рекорд, тиражи и открытые палитры?')) return;
  state = { sound: state.sound, best: 0, editions: 0, palette: 0, session: blankSession() }; save(); el.edition.hidden = true; el.intro.hidden = false; el.room.classList.remove('is-playing'); update();
}
function toggleSound() { state.sound = !state.sound; if (state.sound) { ensureAudio(); tone(360, .06, .055, 'triangle'); } save(); update(); }

function ensureAudio() {
  if (!state.sound) return null;
  if (!audio) { const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) return null; audio = new Audio(); }
  if (audio.state === 'suspended') audio.resume().catch(() => {}); return audio;
}
function tone(frequency, duration, volume, type = 'sine', delay = 0) {
  const ac = ensureAudio(); if (!ac || !state.sound) return; const start = ac.currentTime + delay, osc = ac.createOscillator(), gain = ac.createGain(); osc.type = type; osc.frequency.setValueAtTime(frequency, start); gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(volume, start + .008); gain.gain.exponentialRampToValueAtTime(.0001, start + duration); osc.connect(gain).connect(ac.destination); osc.start(start); osc.stop(start + duration + .02);
}
function layerSound(layer, accuracy) { tone([190, 248, 316][layer] + accuracy * 1.1, .08, .045, layer === 1 ? 'square' : 'triangle'); }
function printSound(accuracy) { const root = 110 + accuracy * .5; tone(root, .16, .06, 'sawtooth'); tone(root * 1.5, .13, .045, 'triangle', .045); }
function editionSound(score) { const root = score >= 700 ? 220 : 174; [1, 1.25, 1.5, 2].forEach((r, i) => tone(root * r, .22, .045, 'triangle', i * .09)); }
function vibrate(pattern) { if ('vibrate' in navigator) navigator.vibrate(pattern); }

function update() {
  const edition = state.editions + (state.session.finished ? 0 : 1);
  el.editionLabel.textContent = `ТИРАЖ ${String(Math.max(1, edition)).padStart(2, '0')}`; el.layer.textContent = `${state.session.layer + 1} / ${LAYERS}`;
  el.print.textContent = `${Math.min(state.session.print + 1, PRINTS)} / ${PRINTS}`; el.combo.textContent = `×${state.session.combo}`;
  el.best.textContent = `РЕКОРД ${String(state.best).padStart(4, '0')}`; el.palette.textContent = `ПАЛИТРА ${String(state.palette + 1).padStart(2, '0')}`;
  el.sound.textContent = state.sound ? 'ЗВУК' : 'ТИХО'; el.sound.setAttribute('aria-pressed', String(state.sound)); el.sound.setAttribute('aria-label', state.sound ? 'Выключить звук' : 'Включить звук');
  document.documentElement.style.setProperty('--paper', colors()[0]);
}
function loop(time) { if (!document.hidden) { draw(time); raf = requestAnimationFrame(loop); } else raf = 0; }
function startLoop() { if (!raf) raf = requestAnimationFrame(loop); }
function visibility() { if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; save(); } else startLoop(); }
function pointer(event) { if (event.button !== undefined && event.button !== 0) return; if (event.target.closest('[data-ui]')) return; event.preventDefault(); lockLayer(); }

addEventListener('resize', resize, { passive: true });
document.addEventListener('visibilitychange', visibility); addEventListener('pagehide', save);
el.room.addEventListener('pointerdown', pointer, { passive: false });
el.start.addEventListener('click', () => state.session.print > 0 || state.session.locked.length ? resume() : startEdition());
el.next.addEventListener('click', startEdition); el.reset.addEventListener('click', reset); el.sound.addEventListener('click', toggleSound);

createWorkshopMode({ appName: 'ОТТИСК', version: '1.0.0', cachePrefix: 'ottisk-', storageNamespace: 'pocket-works:ottisk', onReset() { localStorage.removeItem(KEY); location.reload(); } });
watchConnectivity((online) => { document.documentElement.dataset.network = online ? 'online' : 'offline'; });

resize(); update();
if (state.session.finished) { el.intro.hidden = true; el.editionScore.textContent = state.session.score; el.editionSummary.textContent = `${PRINTS} оттисков. Лучшая серия ×${state.session.bestCombo}. Рекорд ${state.best}.`; el.edition.hidden = false; }
else if (state.session.print > 0 || state.session.locked.length) el.start.querySelector('span').textContent = 'ПРОДОЛЖИТЬ';
startLoop();
