import { bindPointerGesture, installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import { LEVELS, SHAPES } from './levels.js';

installMobileRuntime();

const $ = (selector) => document.querySelector(selector);
const ui = {
  canvas: $('#theatre'), menu: $('#menu-panel'), pause: $('#pause-panel'),
  reveal: $('#reveal-panel'), sceneMeta: $('#scene-meta'), pauseButton: $('#pause-button'),
  playControls: $('#play-controls'), studioControls: $('#studio-controls'),
  sceneCount: $('#scene-count'), sceneTitle: $('#scene-title'),
  sceneHint: $('#scene-hint'), caseMode: $('#case-mode'),
  scoreValue: $('#score-value'), scoreFill: $('#score-fill'),
  scoreMeter: $('#score-meter'), feedback: $('#feedback'),
  pieceTabs: $('#piece-tabs'), studioPieceTabs: $('#studio-piece-tabs'),
  shapePalette: $('#shape-palette'), chapterStrip: $('#chapter-strip'),
  lampRange: $('#lamp-range'), studioLampRange: $('#studio-lamp-range'),
  hintButton: $('#hint-button'), startButton: $('#start-button'),
  soundButton: $('#sound-toggle'), resetButton: $('#reset-button'),
  deletePiece: $('#delete-piece'), exportButton: $('#export-button'),
  revealTitle: $('#reveal-title'), revealText: $('#reveal-text'),
  nextButton: $('#next-button')
};
const context = ui.canvas.getContext('2d', { alpha: false });
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const storage = createVersionedStore({
  namespace: 'pocket-works:scenograph',
  version: 1,
  defaults: { unlocked: 0, chapter: 0, scene: null, studio: null, sound: false },
  validate: (value) => value && typeof value === 'object' && !Array.isArray(value)
});
const stored = storage.getAll();
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const finite = (value) => Number.isFinite(value);
const CUTOUT_SHAPES = new Set(['keyRing', 'house']);
const STUDIO_SHAPES = ['hull', 'sail', 'birdBody', 'leftWing', 'bridgeArch', 'keyRing', 'house', 'crescent', 'starTrail', 'northStar'];
const MASK_SIZE = 192;
const maskCanvas = document.createElement('canvas');
maskCanvas.width = maskCanvas.height = MASK_SIZE;
const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true });
const state = {
  view: 'menu',
  chapter: Number.isInteger(stored.chapter) ? clamp(stored.chapter, 0, LEVELS.length - 1) : 0,
  unlocked: Number.isInteger(stored.unlocked) ? clamp(stored.unlocked, 0, LEVELS.length) : 0,
  pieces: [], studioPieces: [], lampX: 0.5, studioLampX: 0.5,
  selected: null, score: 0, hint: false, drag: null,
  sound: stored.sound === true, resetArmed: false, undoDeleted: null,
  flareStarted: 0, animationMs: 0
};
let goalMask = null;
let pieceGoalMasks = new Map();
let framePending = false;
let audioContext = null;
let currentLayout = null;
let studioSerial = 1;

function initialPieces(level) {
  return level.pieces.map((item) => ({
    id: item.id, shape: item.shape, size: item.size, depth: item.depth,
    x: item.start.x, y: item.start.y, angle: item.start.angle
  }));
}
function targetPieces(level) {
  return level.pieces.map((item) => ({
    id: item.id, shape: item.shape, size: item.size, depth: item.depth,
    x: item.target.x, y: item.target.y, angle: item.target.angle
  }));
}
function validTransform(item) {
  return item && finite(item.x) && finite(item.y) && finite(item.angle)
    && item.x >= 0 && item.x <= 1 && item.y >= 0 && item.y <= 1
    && Math.abs(item.angle) <= Math.PI * 16;
}
function restoreScene(level, index) {
  const saved = storage.get('scene');
  if (!saved || saved.index !== index || !Array.isArray(saved.pieces)
      || saved.pieces.length !== level.pieces.length || !finite(saved.lampX)) return null;
  const pieces = level.pieces.map((definition) => {
    const item = saved.pieces.find((candidate) => candidate.id === definition.id);
    if (!validTransform(item)) return null;
    return {
      id: definition.id, shape: definition.shape, size: definition.size,
      depth: definition.depth, x: item.x, y: item.y, angle: item.angle
    };
  });
  if (pieces.some((item) => !item)) return null;
  return { pieces, lampX: clamp(saved.lampX, 0.08, 0.92) };
}
function restoreStudio() {
  const saved = storage.get('studio');
  if (!saved || !Array.isArray(saved.pieces) || saved.pieces.length > 5
      || !finite(saved.lampX)) return null;
  const pieces = saved.pieces.map((item, index) => {
    if (!SHAPES[item.shape] || !validTransform(item)) return null;
    return {
      id: 'studio-' + index, shape: item.shape,
      size: clamp(finite(item.size) ? item.size : 0.15, 0.1, 0.22),
      depth: clamp(finite(item.depth) ? item.depth : 0.5, 0, 1),
      x: item.x, y: item.y, angle: item.angle
    };
  });
  if (pieces.some((item) => !item)) return null;
  studioSerial = pieces.length + 1;
  return { pieces, lampX: clamp(saved.lampX, 0.08, 0.92) };
}
function saveScene() {
  if (state.pieces.length) {
    storage.patch({
      chapter: state.chapter,
      scene: {
        index: state.chapter, lampX: state.lampX,
        pieces: state.pieces.map(({ id, x, y, angle }) => ({ id, x, y, angle }))
      }
    });
  }
}
function saveStudio() {
  storage.set('studio', {
    lampX: state.studioLampX,
    pieces: state.studioPieces.map(({ shape, size, depth, x, y, angle }) => ({ shape, size, depth, x, y, angle }))
  });
}
function activePieces() { return state.view === 'studio' ? state.studioPieces : state.pieces; }
function activeLamp() { return state.view === 'studio' ? state.studioLampX : state.lampX; }
function selectedPiece() { return activePieces().find((item) => item.id === state.selected) || null; }
function setFeedback(message) { ui.feedback.textContent = message; }

function tracePolygon(ctx, polygon) {
  polygon.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}
function drawFigure(ctx, shapeId, centerX, centerY, angle, scale, fill, stroke = null, dashed = false) {
  const shape = SHAPES[shapeId];
  if (!shape || !finite(scale) || scale <= 0) return;
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke || fill;
  ctx.lineWidth = stroke ? 1.6 / scale : 0;
  if (dashed) ctx.setLineDash([5 / scale, 4 / scale]);
  if (CUTOUT_SHAPES.has(shapeId)) {
    ctx.beginPath();
    shape.polygons.forEach((polygon) => tracePolygon(ctx, polygon));
    ctx.fill('evenodd');
    if (stroke) ctx.stroke();
  } else {
    shape.polygons.forEach((polygon) => {
      ctx.beginPath();
      tracePolygon(ctx, polygon);
      ctx.fill();
      if (stroke) ctx.stroke();
    });
  }
  ctx.restore();
}
function projectedCenter(piece, lampX) {
  const factor = 1.25 + piece.depth * 0.4;
  return {
    x: lampX + (piece.x - lampX) * factor,
    y: 0.88 + (piece.y - 0.88) * factor,
    factor
  };
}
function drawProjectedPiece(ctx, rect, piece, lampX, fill, stroke = null, dashed = false) {
  const projected = projectedCenter(piece, lampX);
  const scale = piece.size * projected.factor * Math.min(rect.w, rect.h);
  drawFigure(ctx, piece.shape,
    rect.x + projected.x * rect.w, rect.y + projected.y * rect.h,
    piece.angle, scale, fill, stroke, dashed);
}
function drawProjectedSet(ctx, rect, pieces, lampX, fill, stroke = null, dashed = false) {
  pieces.forEach((piece) => drawProjectedPiece(ctx, rect, piece, lampX, fill, stroke, dashed));
}
function createMask(pieces, lampX) {
  maskContext.clearRect(0, 0, MASK_SIZE, MASK_SIZE);
  drawProjectedSet(maskContext, { x: 0, y: 0, w: MASK_SIZE, h: MASK_SIZE }, pieces, lampX, '#000');
  const pixels = maskContext.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data;
  const mask = new Uint8Array(MASK_SIZE * MASK_SIZE);
  for (let i = 0; i < mask.length; i++) mask[i] = pixels[i * 4 + 3] > 127 ? 1 : 0;
  return mask;
}
function maskOverlap(current, target) {
  let intersection = 0;
  let union = 0;
  for (let i = 0; i < current.length; i++) {
    if (current[i] && target[i]) intersection++;
    if (current[i] || target[i]) union++;
  }
  return union ? intersection / union : 0;
}
function computeScore() {
  if (!goalMask || state.view !== 'play') return state.score;
  const current = createMask(state.pieces, state.lampX);
  state.score = maskOverlap(current, goalMask);
  const percent = Math.round(state.score * 100);
  ui.scoreValue.textContent = percent + '%';
  ui.scoreFill.style.width = percent + '%';
  ui.scoreMeter.setAttribute('aria-valuenow', String(percent));
  return state.score;
}
function layoutFor(width, height) {
  const inset = clamp(width * 0.055, 15, 28);
  return {
    screen: { x: inset, y: 20, w: width - inset * 2, h: height * 0.58 - 27 },
    table: { x: inset, y: height * 0.63, w: width - inset * 2, h: height * 0.32 }
  };
}
function paperSpecks(ctx, rect, count, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = ((i * 67 + i * i * 13) % 997) / 997;
    const y = ((i * 139 + i * i * 7) % 991) / 991;
    ctx.fillRect(rect.x + x * rect.w, rect.y + y * rect.h, 1, 1);
  }
}
function drawScreen(ctx, rect, mode, pieces, lampX) {
  ctx.save();
  ctx.fillStyle = '#f6f0e1';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  const glow = ctx.createRadialGradient(rect.x + lampX * rect.w, rect.y + rect.h * 0.8, 4,
    rect.x + lampX * rect.w, rect.y + rect.h * 0.52, rect.w * 0.9);
  glow.addColorStop(0, '#fff8e9');
  glow.addColorStop(1, '#e3d9c6');
  ctx.fillStyle = glow;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  paperSpecks(ctx, rect, 175, '#795b3330');
  ctx.strokeStyle = '#91836e2b';
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const y = rect.y + rect.h * i / 5;
    ctx.beginPath(); ctx.moveTo(rect.x, y); ctx.lineTo(rect.x + rect.w, y); ctx.stroke();
  }
  if (mode === 'menu') {
    const first = LEVELS[0];
    ctx.shadowColor = '#51463885';
    ctx.shadowBlur = 14;
    drawProjectedSet(ctx, rect, targetPieces(first), first.lamp.targetX, '#2a302b');
    ctx.shadowBlur = 0;
  } else if (mode === 'studio') {
    ctx.shadowColor = '#5146388c';
    ctx.shadowBlur = 9;
    drawProjectedSet(ctx, rect, pieces, lampX, '#292c29');
    ctx.shadowBlur = 0;
  } else {
    const level = LEVELS[state.chapter];
    if (mode !== 'reveal') {
      drawProjectedSet(ctx, rect, targetPieces(level), level.lamp.targetX, '#c7b59d80', '#ab775789', true);
    }
    ctx.shadowColor = '#514638a0';
    ctx.shadowBlur = mode === 'reveal' ? 18 : 10;
    drawProjectedSet(ctx, rect, pieces, lampX, mode === 'reveal' ? '#266e69' : '#252925');
    ctx.shadowBlur = 0;
  }
  ctx.restore();
  ctx.strokeStyle = '#756b5a';
  ctx.lineWidth = 1.1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  ctx.fillStyle = '#8b7963';
  ctx.font = '700 9px Consolas, monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(mode === 'studio' ? 'ЭКРАН / МАСТЕРСКАЯ' : 'ЭКРАН / ' + String(state.chapter + 1).padStart(2, '0'), rect.x + 9, rect.y + 8);
  ctx.fillText('✦', rect.x + rect.w - 22, rect.y + 8);
}
function drawLamp(ctx, rect, lampX) {
  const x = rect.x + lampX * rect.w;
  const y = rect.y + 0.88 * rect.h;
  const radius = Math.max(14, rect.h * 0.115);
  const aura = ctx.createRadialGradient(x, y - 5, 1, x, y - 5, radius * 3);
  aura.addColorStop(0, '#fff4b999');
  aura.addColorStop(1, '#ffe9b000');
  ctx.fillStyle = aura;
  ctx.beginPath(); ctx.arc(x, y - 5, radius * 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#9b633d';
  ctx.fillRect(x - radius * .72, y + radius * .52, radius * 1.44, radius * .3);
  ctx.strokeStyle = '#6c4b34';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x, y + radius * .48); ctx.lineTo(x, y - radius * .15); ctx.stroke();
  ctx.fillStyle = '#e9b76c';
  ctx.strokeStyle = '#694b32';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y - radius * .31, radius * .55, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff1c4';
  ctx.beginPath(); ctx.arc(x - radius * .12, y - radius * .47, radius * .18, 0, Math.PI * 2); ctx.fill();
}
function drawTable(ctx, rect, pieces, lampX, showHint, selected) {
  ctx.save();
  ctx.fillStyle = '#d8c8a9';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  paperSpecks(ctx, rect, 105, '#654b2d35');
  const lx = rect.x + lampX * rect.w;
  const ly = rect.y + 0.88 * rect.h;
  ctx.fillStyle = '#fff2be34';
  ctx.beginPath();
  ctx.moveTo(lx, ly);
  ctx.lineTo(rect.x + rect.w * 0.16, rect.y);
  ctx.lineTo(rect.x + rect.w * 0.84, rect.y);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#927f613d';
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const x = rect.x + rect.w * i / 5;
    ctx.beginPath(); ctx.moveTo(x, rect.y); ctx.lineTo(x, rect.y + rect.h); ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(rect.x + 9, ly); ctx.lineTo(rect.x + rect.w - 9, ly);
  ctx.strokeStyle = '#9b6e4b'; ctx.lineWidth = 2; ctx.stroke();
  if (showHint && state.view === 'play') {
    const level = LEVELS[state.chapter];
    ctx.fillStyle = '#b36139';
    const tx = rect.x + level.lamp.targetX * rect.w;
    ctx.beginPath(); ctx.arc(tx, ly, 3, 0, Math.PI * 2); ctx.fill();
    targetPieces(level).forEach((piece) => {
      const x = rect.x + piece.x * rect.w;
      const y = rect.y + piece.y * rect.h;
      const unit = piece.size * Math.min(rect.w, rect.h);
      drawFigure(ctx, piece.shape, x, y, piece.angle, unit, '#b3613925', '#a85d39a8', true);
    });
  }
  pieces.forEach((piece) => {
    const x = rect.x + piece.x * rect.w;
    const y = rect.y + piece.y * rect.h;
    const unit = piece.size * Math.min(rect.w, rect.h);
    if (selected === piece.id) {
      ctx.strokeStyle = '#a75e36';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(x, y, Math.max(19, unit * 1.25), 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.shadowColor = '#4d443880'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
    drawFigure(ctx, piece.shape, x, y, piece.angle, unit, selected === piece.id ? '#347f79' : '#648981', '#2c504a');
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = '#f5ecd5';
    ctx.beginPath(); ctx.arc(x, y, 2.7, 0, Math.PI * 2); ctx.fill();
  });
  drawLamp(ctx, rect, lampX);
  ctx.restore();
  ctx.strokeStyle = '#756b5a'; ctx.lineWidth = 1.1;
  ctx.strokeRect(rect.x + .5, rect.y + .5, rect.w - 1, rect.h - 1);
  ctx.fillStyle = '#665843';
  ctx.font = '700 9px Consolas, monospace';
  ctx.textBaseline = 'top';
  ctx.fillText('СТОЛ / ПЕРЕТАСКИВАЙТЕ ФИГУРЫ', rect.x + 9, rect.y + 8);
}
function drawDivider(ctx, width, height) {
  const y = height * .605;
  ctx.strokeStyle = '#c0aa87';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = '#b08b69';
    ctx.beginPath(); ctx.arc(15 + i * (width - 30) / 8, y, 1.5, 0, Math.PI * 2); ctx.fill();
  }
}
function drawRevealBurst(ctx, rect, elapsed) {
  if (reduceMotion.matches) return;
  const t = clamp(elapsed / 850, 0, 1);
  if (t >= 1) return;
  const centers = state.pieces.map((piece) => projectedCenter(piece, state.lampX));
  const x = rect.x + centers.reduce((sum, point) => sum + point.x, 0) / centers.length * rect.w;
  const y = rect.y + centers.reduce((sum, point) => sum + point.y, 0) / centers.length * rect.h;
  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  ctx.strokeStyle = 'rgba(41,112,104,' + ((1 - t) * .33) + ')';
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(x, y, 16 + 88 * t, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 15; i++) {
    const angle = i * 2.39996;
    const radius = 22 + (31 + i % 4 * 11) * t;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    const size = (2.5 + i % 3) * (1 - .45 * t);
    ctx.fillStyle = i % 3 === 0
      ? 'rgba(179,97,57,' + (1 - t) + ')'
      : 'rgba(53,125,120,' + (1 - t) + ')';
    ctx.beginPath();
    ctx.moveTo(px, py - size); ctx.lineTo(px + size * .55, py);
    ctx.lineTo(px, py + size); ctx.lineTo(px - size * .55, py);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function paint() {
  framePending = false;
  const width = ui.canvas.clientWidth;
  const height = ui.canvas.clientHeight;
  if (!width || !height) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (ui.canvas.width !== pixelWidth || ui.canvas.height !== pixelHeight) {
    ui.canvas.width = pixelWidth; ui.canvas.height = pixelHeight;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#e2d6bf';
  context.fillRect(0, 0, width, height);
  currentLayout = layoutFor(width, height);
  let pieces;
  let lampX;
  if (state.view === 'menu') {
    pieces = initialPieces(LEVELS[0]);
    lampX = LEVELS[0].lamp.startX;
  } else {
    pieces = activePieces();
    lampX = activeLamp();
  }
  drawScreen(context, currentLayout.screen, state.view, pieces, lampX);
  drawDivider(context, width, height);
  drawTable(context, currentLayout.table, pieces, lampX, state.hint, state.selected);
  if (state.view === 'reveal' && !document.hidden && !reduceMotion.matches) {
    const elapsed = Math.max(state.animationMs, performance.now() - state.flareStarted);
    drawRevealBurst(context, currentLayout.screen, elapsed);
    if (elapsed < 850) requestPaint();
  }
}
function requestPaint() {
  if (framePending) return;
  framePending = true;
  requestAnimationFrame(paint);
}
function resize() { requestPaint(); }

function updateChapterStrip() {
  ui.chapterStrip.replaceChildren();
  LEVELS.forEach((level, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = String(index + 1).padStart(2, '0');
    const available = index <= state.unlocked;
    button.disabled = !available;
    button.className = available ? (index === state.unlocked ? 'current' : '') : 'locked';
    button.setAttribute('aria-label', available
      ? 'Открыть сцену ' + (index + 1) + ': ' + level.revealTitle
      : 'Сцена ' + (index + 1) + ' пока закрыта');
    if (available) button.addEventListener('click', () => loadLevel(index, false));
    ui.chapterStrip.append(button);
  });
  ui.startButton.firstChild.textContent = state.unlocked === LEVELS.length
    ? 'Сыграть историю снова ' : state.unlocked > 0 ? 'Продолжить историю ' : 'Открыть занавес ';
}
function updatePieceTabs() {
  const container = state.view === 'studio' ? ui.studioPieceTabs : ui.pieceTabs;
  container.replaceChildren();
  activePieces().forEach((piece, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = (index + 1) + ' · ' + SHAPES[piece.shape].label;
    button.setAttribute('aria-pressed', String(piece.id === state.selected));
    button.addEventListener('click', () => {
      state.selected = piece.id;
      state.undoDeleted = null;
      ui.deletePiece.textContent = 'Убрать фигуру';
      updatePieceTabs();
      requestPaint();
      playNote(310, .06, .02);
      setFeedback('Выбрана фигура: ' + SHAPES[piece.shape].label + '.');
    });
    container.append(button);
  });
  ui.deletePiece.disabled = state.view === 'studio' && !selectedPiece() && !state.undoDeleted;
}
function updatePalette() {
  ui.shapePalette.replaceChildren();
  STUDIO_SHAPES.forEach((shapeId) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '+ ' + SHAPES[shapeId].label;
    button.disabled = state.studioPieces.length >= 5;
    button.addEventListener('click', () => addStudioPiece(shapeId));
    ui.shapePalette.append(button);
  });
}
function setView(view) {
  state.view = view;
  document.body.dataset.view = view;
  ui.menu.hidden = view !== 'menu';
  ui.pause.hidden = view !== 'pause';
  ui.reveal.hidden = view !== 'reveal';
  ui.sceneMeta.hidden = !['play', 'pause', 'reveal'].includes(view);
  ui.pauseButton.hidden = view !== 'play';
  ui.playControls.hidden = view !== 'play';
  ui.studioControls.hidden = view !== 'studio';
  ui.caseMode.textContent = view === 'menu' ? 'ПРОЛОГ'
    : view === 'studio' ? 'МАСТЕРСКАЯ'
      : 'СЦЕНА ' + String(state.chapter + 1).padStart(2, '0');
  if (view === 'menu') {
    updateChapterStrip();
    setFeedback('Выберите сцену или откройте свободную мастерскую.');
  } else if (view === 'play') {
    setFeedback('Перетаскивайте фигуры на нижнем столе. Тень меняется сразу.');
  } else if (view === 'studio') {
    setFeedback('В мастерской можно собрать любую тень и сохранить открытку.');
  }
  requestPaint();
}
function loadLevel(index, resume = true) {
  if (!Number.isInteger(index) || index < 0 || index >= LEVELS.length || index > state.unlocked) return;
  const level = LEVELS[index];
  state.chapter = index;
  const recovered = resume ? restoreScene(level, index) : null;
  state.pieces = recovered ? recovered.pieces : initialPieces(level);
  state.lampX = recovered ? recovered.lampX : level.lamp.startX;
  state.selected = state.pieces[0]?.id || null;
  state.hint = false;
  state.drag = null;
  goalMask = createMask(targetPieces(level), level.lamp.targetX);
  pieceGoalMasks = new Map(targetPieces(level).map((piece) => [
    piece.id, createMask([piece], level.lamp.targetX)
  ]));
  ui.sceneCount.textContent = 'СЦЕНА ' + String(index + 1).padStart(2, '0') + ' / ' + String(LEVELS.length).padStart(2, '0');
  ui.sceneTitle.textContent = level.revealTitle;
  ui.sceneHint.textContent = level.hint;
  ui.hintButton.textContent = 'Показать намёк';
  ui.hintButton.setAttribute('aria-pressed', 'false');
  ui.lampRange.value = String(state.lampX);
  disarmReset();
  setView('play');
  updatePieceTabs();
  computeScore();
  saveScene();
}
function enterStudio() {
  const recovered = restoreStudio();
  if (recovered) {
    state.studioPieces = recovered.pieces;
    state.studioLampX = recovered.lampX;
  } else {
    const first = LEVELS[0];
    state.studioPieces = targetPieces(first).map((piece, index) => ({ ...piece, id: 'studio-' + index }));
    state.studioLampX = first.lamp.targetX;
    studioSerial = state.studioPieces.length + 1;
  }
  state.selected = state.studioPieces[0]?.id || null;
  state.drag = null;
  state.hint = false;
  state.undoDeleted = null;
  ui.deletePiece.textContent = 'Убрать фигуру';
  ui.studioLampRange.value = String(state.studioLampX);
  setView('studio');
  updatePieceTabs();
  updatePalette();
  saveStudio();
}
function goToMenu() {
  if (state.view === 'play' || state.view === 'pause') saveScene();
  if (state.view === 'studio') saveStudio();
  state.drag = null;
  state.selected = null;
  setView('menu');
}
function disarmReset() {
  state.resetArmed = false;
  ui.resetButton.textContent = 'Начать сцену заново';
}
function finishLevel() {
  if (state.view !== 'play') return;
  state.unlocked = Math.max(state.unlocked, state.chapter + 1);
  storage.patch({ unlocked: state.unlocked, chapter: Math.min(state.chapter + 1, LEVELS.length - 1), scene: null });
  const level = LEVELS[state.chapter];
  ui.revealTitle.textContent = level.revealTitle;
  ui.revealText.textContent = level.revealText;
  ui.nextButton.firstChild.textContent = state.chapter === LEVELS.length - 1
    ? 'Открыть мастерскую ' : 'Следующая сцена ';
  state.drag = null;
  state.flareStarted = performance.now();
  state.animationMs = 0;
  setView('reveal');
  playSuccess();
  navigator.vibrate?.([12, 32, 12]);
}
function checkWin() {
  if (state.view !== 'play') return;
  computeScore();
  if (state.score < 0.78) return;
  const allPiecesMatched = state.pieces.every((piece) =>
    maskOverlap(createMask([piece], state.lampX), pieceGoalMasks.get(piece.id)) >= 0.48
  );
  if (allPiecesMatched) finishLevel();
}
function angularDifference(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
function snapSelectedShadow() {
  const piece = selectedPiece();
  if (!piece || state.view !== 'play') return false;
  const level = LEVELS[state.chapter];
  const definition = level.pieces.find((item) => item.id === piece.id);
  if (!definition) return false;
  const actual = projectedCenter(piece, state.lampX);
  const desired = projectedCenter({ ...piece, x: definition.target.x, y: definition.target.y }, level.lamp.targetX);
  const distance = Math.hypot(actual.x - desired.x, actual.y - desired.y);
  if (distance > 0.055 || Math.abs(angularDifference(piece.angle, definition.target.angle)) > 0.29) return false;
  piece.x = clamp(state.lampX + (desired.x - state.lampX) / actual.factor, 0.08, 0.92);
  piece.y = clamp(0.88 + (desired.y - 0.88) / actual.factor, 0.16, 0.82);
  piece.angle = definition.target.angle;
  playNote(540, .1, .03);
  setFeedback('Фигура мягко встала в контур.');
  return true;
}
function rotateSelected(delta) {
  const piece = selectedPiece();
  if (!piece) return;
  state.undoDeleted = null;
  ui.deletePiece.textContent = 'Убрать фигуру';
  piece.angle = Math.round((piece.angle + delta) * 1e5) / 1e5;
  if (state.view === 'play') {
    snapSelectedShadow();
    checkWin();
    if (state.view === 'play') saveScene();
  } else {
    saveStudio();
  }
  updatePieceTabs();
  requestPaint();
  playNote(delta > 0 ? 380 : 290, .05, .015);
}
function addStudioPiece(shapeId) {
  if (state.view !== 'studio' || state.studioPieces.length >= 5) return;
  const count = state.studioPieces.length;
  const piece = {
    id: 'studio-' + studioSerial++, shape: shapeId, size: 0.15, depth: 0.5,
    x: clamp(0.36 + count * 0.085, 0.2, 0.78),
    y: clamp(0.43 + (count % 2) * 0.16, 0.25, 0.72), angle: 0
  };
  state.studioPieces.push(piece);
  state.selected = piece.id;
  state.undoDeleted = null;
  ui.deletePiece.textContent = 'Убрать фигуру';
  updatePieceTabs();
  updatePalette();
  requestPaint();
  saveStudio();
  playNote(410, .07, .025);
  setFeedback('Добавлена фигура: ' + SHAPES[shapeId].label + '.');
}
function deleteOrUndoPiece() {
  if (state.view !== 'studio') return;
  if (state.undoDeleted) {
    state.studioPieces.splice(state.undoDeleted.index, 0, state.undoDeleted.piece);
    state.selected = state.undoDeleted.piece.id;
    state.undoDeleted = null;
    ui.deletePiece.textContent = 'Убрать фигуру';
    setFeedback('Фигура возвращена.');
  } else {
    const index = state.studioPieces.findIndex((piece) => piece.id === state.selected);
    if (index < 0) return;
    const [piece] = state.studioPieces.splice(index, 1);
    state.undoDeleted = { piece, index };
    state.selected = state.studioPieces[0]?.id || null;
    ui.deletePiece.textContent = 'Вернуть фигуру';
    setFeedback('Фигура убрана. Её можно вернуть.');
  }
  updatePieceTabs();
  updatePalette();
  requestPaint();
  saveStudio();
}
function playNote(frequency, duration = .08, volume = .02, delay = 0) {
  if (!state.sound) return;
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    audioContext ||= new AudioCtor();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    const when = audioContext.currentTime + delay;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, when);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * .72, when + duration);
    gain.gain.setValueAtTime(.001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + .012);
    gain.gain.exponentialRampToValueAtTime(.001, when + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(when);
    oscillator.stop(when + duration + .01);
  } catch { /* Sound is optional. */ }
}
function playSuccess() {
  playNote(330, .24, .03, 0);
  playNote(440, .28, .025, .1);
  playNote(660, .38, .026, .21);
}
function pointInCanvas(event) {
  const box = ui.canvas.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
}
function tablePoint(point) {
  const table = currentLayout?.table;
  if (!table) return null;
  return {
    x: (point.x - table.x) / table.w,
    y: (point.y - table.y) / table.h
  };
}
function pointerStart(event) {
  if (state.view !== 'play' && state.view !== 'studio') return;
  const point = tablePoint(pointInCanvas(event));
  if (!point || point.x < -.04 || point.x > 1.04 || point.y < -.04 || point.y > 1.04) return;
  disarmReset();
  const table = currentLayout.table;
  const lampX = activeLamp();
  const lampDistance = Math.hypot((point.x - lampX) * table.w, (point.y - .88) * table.h);
  if (lampDistance < 22) {
    state.drag = { kind: 'lamp', pointerId: event.pointerId, offsetX: lampX - point.x };
    playNote(240, .04, .015);
    return;
  }
  const pieces = activePieces();
  let chosen = null;
  const preferred = pieces.find((piece) => piece.id === state.selected);
  if (preferred) {
    const distance = Math.hypot((point.x - preferred.x) * table.w, (point.y - preferred.y) * table.h);
    if (distance <= Math.max(30, preferred.size * Math.min(table.w, table.h) * 1.4)) chosen = preferred;
  }
  for (let i = pieces.length - 1; i >= 0; i--) {
    if (chosen) break;
    const piece = pieces[i];
    const distance = Math.hypot((point.x - piece.x) * table.w, (point.y - piece.y) * table.h);
    if (distance <= Math.max(30, piece.size * Math.min(table.w, table.h) * 1.4)) {
      chosen = piece;
      break;
    }
  }
  if (!chosen) {
    setFeedback('Коснитесь фигуры на столе или выберите её под сценой.');
    return;
  }
  state.selected = chosen.id;
  state.drag = {
    kind: 'piece', pointerId: event.pointerId, id: chosen.id,
    offsetX: chosen.x - point.x, offsetY: chosen.y - point.y
  };
  state.undoDeleted = null;
  ui.deletePiece.textContent = 'Убрать фигуру';
  updatePieceTabs();
  requestPaint();
  playNote(300, .04, .012);
}
function pointerMove(event) {
  const drag = state.drag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const point = tablePoint(pointInCanvas(event));
  if (!point) return;
  if (drag.kind === 'lamp') {
    const x = clamp(point.x + drag.offsetX, 0.08, 0.92);
    if (state.view === 'studio') {
      state.studioLampX = x; ui.studioLampRange.value = String(x);
    } else {
      state.lampX = x; ui.lampRange.value = String(x); computeScore();
    }
  } else {
    const piece = activePieces().find((item) => item.id === drag.id);
    if (!piece) return;
    piece.x = clamp(point.x + drag.offsetX, 0.08, 0.92);
    piece.y = clamp(point.y + drag.offsetY, 0.16, 0.82);
    if (state.view === 'play') computeScore();
  }
  requestPaint();
}
function pointerFinish(event, cancelled) {
  if (!state.drag || state.drag.pointerId !== event.pointerId) return;
  const kind = state.drag.kind;
  state.drag = null;
  if (state.view === 'play') {
    if (!cancelled && kind === 'piece') snapSelectedShadow();
    if (!cancelled) checkWin();
    if (state.view === 'play') saveScene();
  } else if (state.view === 'studio') saveStudio();
  requestPaint();
}
bindPointerGesture(ui.canvas, {
  onStart: pointerStart,
  onMove: pointerMove,
  onEnd: (event) => pointerFinish(event, false),
  onCancel: (event) => pointerFinish(event, true)
});

function drawPostcard() {
  const card = document.createElement('canvas');
  card.width = 1200;
  card.height = 1600;
  const ctx = card.getContext('2d');
  ctx.fillStyle = '#eee9d8';
  ctx.fillRect(0, 0, card.width, card.height);
  ctx.strokeStyle = '#8c7f69';
  ctx.lineWidth = 3;
  ctx.strokeRect(58, 58, 1084, 1484);
  ctx.strokeStyle = '#b36139';
  ctx.lineWidth = 2;
  ctx.strokeRect(72, 72, 1056, 1456);
  ctx.fillStyle = '#874727';
  ctx.font = '700 22px Consolas, monospace';
  ctx.fillText('SCENOGRAPH  /  ЛИЧНАЯ СЦЕНА', 106, 132);
  ctx.fillStyle = '#292820';
  ctx.font = '400 88px Georgia, serif';
  ctx.fillText('Тень, которую', 106, 242);
  ctx.fillText('я придумал', 106, 338);
  const screen = { x: 106, y: 425, w: 988, h: 940 };
  ctx.fillStyle = '#f7f1e3';
  ctx.fillRect(screen.x, screen.y, screen.w, screen.h);
  ctx.save();
  ctx.beginPath(); ctx.rect(screen.x, screen.y, screen.w, screen.h); ctx.clip();
  paperSpecks(ctx, screen, 900, '#80664125');
  const glow = ctx.createRadialGradient(
    screen.x + state.studioLampX * screen.w, screen.y + screen.h * .7, 8,
    screen.x + state.studioLampX * screen.w, screen.y + screen.h * .5, screen.w * .95
  );
  glow.addColorStop(0, '#fff8e8');
  glow.addColorStop(1, '#e3d9c6');
  ctx.fillStyle = glow;
  ctx.fillRect(screen.x, screen.y, screen.w, screen.h);
  drawProjectedSet(ctx, screen, state.studioPieces, state.studioLampX, '#29312e');
  ctx.restore();
  ctx.strokeStyle = '#6d6150';
  ctx.lineWidth = 2;
  ctx.strokeRect(screen.x, screen.y, screen.w, screen.h);
  ctx.fillStyle = '#635746';
  ctx.font = '700 20px Consolas, monospace';
  ctx.fillText('СВЕТ  /  БУМАГА  /  ВООБРАЖЕНИЕ', 106, 1420);
  ctx.fillText(new Date().toLocaleDateString('ru-RU'), 106, 1480);
  ctx.fillText('POCKET WORKS  ·  СЦЕНОГРАФ', 702, 1480);
  return card;
}
async function exportPostcard() {
  if (state.view !== 'studio') return;
  if (!state.studioPieces.length) {
    setFeedback('Добавьте хотя бы одну фигуру для открытки.');
    return;
  }
  try {
    const card = drawPostcard();
    const blob = await new Promise((resolve) => card.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG unavailable');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scenograph-' + new Date().toISOString().slice(0, 10) + '.png';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setFeedback('Открытка сохранена в PNG.');
    playSuccess();
  } catch {
    setFeedback('Не удалось сохранить PNG. Попробуйте ещё раз.');
  }
}
function toggleSound() {
  state.sound = !state.sound;
  storage.set('sound', state.sound);
  ui.soundButton.textContent = state.sound ? 'Звук: вкл' : 'Звук: выкл';
  ui.soundButton.setAttribute('aria-pressed', String(state.sound));
  if (state.sound) playNote(420, .08, .02);
}
function resetScene() {
  if (state.view !== 'play') return;
  if (!state.resetArmed) {
    state.resetArmed = true;
    ui.resetButton.textContent = 'Подтвердить сброс';
    setFeedback('Нажмите ещё раз, чтобы начать сцену заново.');
    setTimeout(() => { if (state.resetArmed) disarmReset(); }, 3500);
    return;
  }
  loadLevel(state.chapter, false);
  setFeedback('Сцена началась заново.');
  playNote(190, .1, .02);
}
function adjustLamp(value, studio, commit) {
  const x = clamp(Number(value), 0.08, 0.92);
  if (!finite(x)) return;
  if (studio) {
    if (state.view !== 'studio') return;
    state.studioLampX = x;
    if (commit) saveStudio();
  } else {
    if (state.view !== 'play') return;
    state.lampX = x;
    computeScore();
    if (commit) {
      checkWin();
      if (state.view === 'play') saveScene();
    }
  }
  requestPaint();
}
$('#start-button').addEventListener('click', () => {
  const index = state.unlocked >= LEVELS.length ? 0 : state.unlocked;
  loadLevel(index, true);
  playNote(370, .09, .02);
});
$('#studio-button').addEventListener('click', enterStudio);
$('#studio-menu-button').addEventListener('click', goToMenu);
$('#pause-button').addEventListener('click', () => {
  if (state.view !== 'play') return;
  saveScene();
  setView('pause');
});
$('#resume-button').addEventListener('click', () => setView('play'));
$('#pause-menu-button').addEventListener('click', goToMenu);
$('#reveal-menu-button').addEventListener('click', goToMenu);
$('#next-button').addEventListener('click', () => {
  if (state.chapter === LEVELS.length - 1) enterStudio();
  else loadLevel(state.chapter + 1, false);
});
$('#rotate-left').addEventListener('click', () => rotateSelected(-Math.PI / 12));
$('#rotate-right').addEventListener('click', () => rotateSelected(Math.PI / 12));
$('#studio-rotate-left').addEventListener('click', () => rotateSelected(-Math.PI / 12));
$('#studio-rotate-right').addEventListener('click', () => rotateSelected(Math.PI / 12));
ui.hintButton.addEventListener('click', () => {
  if (state.view !== 'play') return;
  state.hint = !state.hint;
  ui.hintButton.textContent = state.hint ? 'Скрыть намёк' : 'Показать намёк';
  ui.hintButton.setAttribute('aria-pressed', String(state.hint));
  setFeedback(state.hint
    ? 'Медные контуры на столе показывают места фигур и лампы.'
    : 'Намёк скрыт.');
  requestPaint();
});
ui.resetButton.addEventListener('click', resetScene);
ui.lampRange.addEventListener('input', (event) => adjustLamp(event.target.value, false, false));
ui.lampRange.addEventListener('change', (event) => adjustLamp(event.target.value, false, true));
ui.studioLampRange.addEventListener('input', (event) => adjustLamp(event.target.value, true, false));
ui.studioLampRange.addEventListener('change', (event) => adjustLamp(event.target.value, true, true));
ui.deletePiece.addEventListener('click', deleteOrUndoPiece);
ui.exportButton.addEventListener('click', exportPostcard);
ui.soundButton.addEventListener('click', toggleSound);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (state.view === 'play') { saveScene(); setView('pause'); }
    else if (state.view === 'pause') setView('play');
    else if (state.view === 'studio' || state.view === 'reveal') goToMenu();
    return;
  }
  if (state.view !== 'play' && state.view !== 'studio') return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  const piece = selectedPiece();
  if (!piece) return;
  const step = event.shiftKey ? .035 : .012;
  let used = true;
  switch (event.key.toLowerCase()) {
    case 'arrowleft': piece.x = clamp(piece.x - step, .08, .92); break;
    case 'arrowright': piece.x = clamp(piece.x + step, .08, .92); break;
    case 'arrowup': piece.y = clamp(piece.y - step, .16, .82); break;
    case 'arrowdown': piece.y = clamp(piece.y + step, .16, .82); break;
    case 'q': piece.angle -= Math.PI / 12; break;
    case 'e': piece.angle += Math.PI / 12; break;
    default: used = false;
  }
  if (!used) return;
  event.preventDefault();
  if (state.view === 'play') {
    snapSelectedShadow();
    checkWin();
    if (state.view === 'play') saveScene();
  } else saveStudio();
  requestPaint();
});
window.addEventListener('resize', resize, { passive: true });
window.addEventListener('appviewportchange', resize);
new ResizeObserver(resize).observe(ui.canvas);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state.view === 'play' || state.view === 'pause') saveScene();
    if (state.view === 'studio') saveStudio();
  } else requestPaint();
});
window.addEventListener('pagehide', () => {
  if (state.view === 'play' || state.view === 'pause') saveScene();
  if (state.view === 'studio') saveStudio();
});
window.addEventListener('appdatareset', () => {
  state.unlocked = 0;
  state.chapter = 0;
  state.pieces = [];
  state.studioPieces = [];
  state.selected = null;
  state.sound = false;
  ui.soundButton.textContent = 'Звук: выкл';
  ui.soundButton.setAttribute('aria-pressed', 'false');
  setView('menu');
});
createWorkshopMode({
  appName: 'Сценограф',
  version: '0.1.0',
  cachePrefix: 'scenograph-',
  storageNamespace: 'pocket-works:scenograph',
  onReset() {
    storage.reset();
    window.dispatchEvent(new CustomEvent('appdatareset'));
  }
});
watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});
window.render_game_to_text = () => JSON.stringify({
  coordinates: 'Table and screen use normalized x/y in [0,1], origin top-left. Lamp y=0.88; screen shadow is projected away from lamp.',
  mode: state.view,
  chapter: state.view === 'studio' || state.view === 'menu' ? null : state.chapter + 1,
  unlocked: state.unlocked,
  lampX: Number(activeLamp().toFixed(3)),
  pieces: activePieces().map((piece) => ({
    id: piece.id, shape: piece.shape, x: Number(piece.x.toFixed(3)),
    y: Number(piece.y.toFixed(3)), angle: Number(piece.angle.toFixed(3))
  })),
  selected: state.selected,
  score: state.view === 'play' ? Number(state.score.toFixed(3)) : null,
  target: state.view === 'play'
    ? { lampX: LEVELS[state.chapter].lamp.targetX,
        pieces: LEVELS[state.chapter].pieces.map((piece) => ({
          id: piece.id, x: piece.target.x, y: piece.target.y, angle: piece.target.angle
        })) }
    : null
});
window.advanceTime = (ms) => {
  state.animationMs += Math.max(0, Number(ms) || 0);
  paint();
};
ui.soundButton.textContent = state.sound ? 'Звук: вкл' : 'Звук: выкл';
ui.soundButton.setAttribute('aria-pressed', String(state.sound));
setView('menu');
