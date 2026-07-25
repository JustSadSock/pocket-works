import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  MATERIALS,
  MAX_LOG_SCALE,
  MIN_LOG_SCALE,
  OBJECTS,
  clamp,
  cubeSideForMass,
  formatCompact,
  formatLength,
  formatRatio,
  massFromLog,
  materialById,
  nearestObject,
  objectById,
  objectLog,
  sanitizeState,
  superscript
} from './engine.js';

installMobileRuntime();

const APP_VERSION = '1.0.0';
const STORAGE_NAMESPACE = 'pocket-works:poryadok';
const STORAGE_KEY = `${STORAGE_NAMESPACE}:state-v1`;
const PX_PER_DECADE = 126;

const defaults = Object.freeze({
  schema: 1,
  logScale: Math.log10(1.75),
  selectedId: 'human',
  pinnedIds: ['human', 'earth'],
  compareBaseId: 'human',
  massLogKg: 1,
  materialId: 'osmium',
  screen: 'scale',
  onboarded: false,
  settings: { sound: true, haptics: true }
});

const els = {
  contextLabel: document.querySelector('#contextLabel'),
  scaleGroup: document.querySelector('#scaleGroup'),
  scaleTitle: document.querySelector('#scaleTitle'),
  stageWrap: document.querySelector('#stageWrap'),
  scaleCanvas: document.querySelector('#scaleCanvas'),
  stageHint: document.querySelector('#stageHint'),
  orderExponent: document.querySelector('#orderExponent'),
  orderProgress: document.querySelector('#orderProgress'),
  specimenIndex: document.querySelector('#specimenIndex'),
  specimenGroup: document.querySelector('#specimenGroup'),
  specimenName: document.querySelector('#specimenName'),
  specimenSize: document.querySelector('#specimenSize'),
  specimenNote: document.querySelector('#specimenNote'),
  pinButton: document.querySelector('#pinButton'),
  previousObjectName: document.querySelector('#previousObjectName'),
  nextObjectName: document.querySelector('#nextObjectName'),
  previousObjectButton: document.querySelector('#previousObjectButton'),
  nextObjectButton: document.querySelector('#nextObjectButton'),
  smallerButton: document.querySelector('#smallerButton'),
  largerButton: document.querySelector('#largerButton'),
  jumpButton: document.querySelector('#jumpButton'),
  scaleScreen: document.querySelector('#scaleScreen'),
  compareScreen: document.querySelector('#compareScreen'),
  matterScreen: document.querySelector('#matterScreen'),
  compareSummary: document.querySelector('#compareSummary'),
  compareRack: document.querySelector('#compareRack'),
  compareEmpty: document.querySelector('#compareEmpty'),
  clearPinsButton: document.querySelector('#clearPinsButton'),
  pinCountBadge: document.querySelector('#pinCountBadge'),
  massSlider: document.querySelector('#massSlider'),
  massValue: document.querySelector('#massValue'),
  materialStage: document.querySelector('#materialStage'),
  materialCanvas: document.querySelector('#materialCanvas'),
  materialDetail: document.querySelector('#materialDetail'),
  materialDensity: document.querySelector('#materialDensity'),
  materialName: document.querySelector('#materialName'),
  materialSide: document.querySelector('#materialSide'),
  materialNote: document.querySelector('#materialNote'),
  materialList: document.querySelector('#materialList'),
  settingsButton: document.querySelector('#settingsButton'),
  settingsSheet: document.querySelector('#settingsSheet'),
  objectSheet: document.querySelector('#objectSheet'),
  objectSearch: document.querySelector('#objectSearch'),
  objectCatalog: document.querySelector('#objectCatalog'),
  sheetBackdrop: document.querySelector('#sheetBackdrop'),
  soundToggle: document.querySelector('#soundToggle'),
  hapticsToggle: document.querySelector('#hapticsToggle'),
  showGuideButton: document.querySelector('#showGuideButton'),
  resetButton: document.querySelector('#resetButton'),
  guideModal: document.querySelector('#guideModal'),
  startButton: document.querySelector('#startButton'),
  resetModal: document.querySelector('#resetModal'),
  confirmResetButton: document.querySelector('#confirmResetButton'),
  toast: document.querySelector('#toast')
};

let state = loadState();
let currentLog = state.logScale;
let targetLog = currentLog;
let lastOrder = Math.floor(currentLog);
let scaleDpr = 1;
let materialDpr = 1;
let scaleSize = { width: 1, height: 1 };
let materialSize = { width: 1, height: 1 };
let scaleContext = els.scaleCanvas.getContext('2d');
let materialContext = els.materialCanvas.getContext('2d');
let renderFrame = 0;
let saveTimer = 0;
let toastTimer = 0;
let hintTimer = 0;
let audioContext = null;
let directInteraction = false;
let movedDuringGesture = false;
let selectedBeforeGesture = state.selectedId;
const pointers = new Map();
let dragStart = null;
let pinchStart = null;

function cloneDefaults() {
  return JSON.parse(JSON.stringify(defaults));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return sanitizeState(raw ? JSON.parse(raw) : cloneDefaults());
  } catch {
    return sanitizeState(cloneDefaults());
  }
}

function saveState() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      state.logScale = clamp(currentLog, MIN_LOG_SCALE, MAX_LOG_SCALE);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage failure must not stop the instrument.
    }
  }, 80);
}

function haptic(pattern = 8) {
  if (!state.settings.haptics || !navigator.vibrate) return;
  navigator.vibrate(pattern);
}

function playTick(frequency = 420, duration = 0.025, gain = 0.018) {
  if (!state.settings.sound) return;
  try {
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const volume = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(gain, audioContext.currentTime);
    volume.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    oscillator.connect(volume).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch {
    // Audio is progressive enhancement.
  }
}

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => els.toast.classList.remove('is-visible'), 1800);
}

function fadeHint() {
  clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => els.stageHint.classList.add('is-faded'), 800);
}

function engineeringScaleLabel(logScale) {
  const exponent = Math.floor(logScale);
  const mantissa = 10 ** (logScale - exponent);
  const value = mantissa * (10 ** exponent);
  return formatLength(value);
}

function scaleContextName(logScale) {
  if (logScale < -12) return 'субатомный масштаб';
  if (logScale < -9) return 'атомный масштаб';
  if (logScale < -6) return 'молекулярный масштаб';
  if (logScale < -3) return 'микроскопический масштаб';
  if (logScale < 1) return 'человеческий масштаб';
  if (logScale < 4) return 'архитектурный масштаб';
  if (logScale < 7) return 'планетарный масштаб';
  if (logScale < 13) return 'солнечная система';
  if (logScale < 20) return 'межзвёздный масштаб';
  if (logScale < 24) return 'галактический масштаб';
  return 'космическая сеть';
}

function scheduleRender() {
  if (renderFrame) return;
  renderFrame = requestAnimationFrame(renderLoop);
}

function renderLoop() {
  renderFrame = 0;
  if (!directInteraction) {
    const distance = targetLog - currentLog;
    if (Math.abs(distance) > 0.0005) {
      currentLog += distance * 0.18;
      scheduleRender();
    } else {
      currentLog = targetLog;
    }
  }
  currentLog = clamp(currentLog, MIN_LOG_SCALE, MAX_LOG_SCALE);
  updateOrderFeedback();
  updateSelectedFromScale();
  drawScale();
  updateScaleUi();
}

function updateOrderFeedback() {
  const order = Math.floor(currentLog);
  if (order === lastOrder) return;
  lastOrder = order;
  haptic(5);
  playTick(320 + ((order - MIN_LOG_SCALE) / (MAX_LOG_SCALE - MIN_LOG_SCALE)) * 300, 0.018, 0.012);
}

function updateSelectedFromScale() {
  const object = nearestObject(currentLog);
  if (object.id === state.selectedId) return;
  state.selectedId = object.id;
  saveState();
}

function updateScaleUi() {
  const selected = objectById(state.selectedId) || nearestObject(currentLog);
  const index = OBJECTS.findIndex((object) => object.id === selected.id);
  const previous = OBJECTS[Math.max(0, index - 1)];
  const next = OBJECTS[Math.min(OBJECTS.length - 1, index + 1)];
  const exponent = Math.floor(currentLog);
  const progress = ((currentLog - MIN_LOG_SCALE) / (MAX_LOG_SCALE - MIN_LOG_SCALE)) * 100;

  els.contextLabel.textContent = scaleContextName(currentLog);
  els.scaleGroup.textContent = selected.group;
  els.scaleTitle.textContent = engineeringScaleLabel(currentLog);
  els.orderExponent.textContent = `10${superscript(exponent)} м`;
  els.orderProgress.style.width = `${clamp(progress, 0, 100)}%`;
  els.specimenIndex.textContent = `${index + 1} / ${OBJECTS.length}`;
  els.specimenGroup.textContent = selected.group;
  els.specimenName.textContent = selected.name;
  els.specimenSize.textContent = formatLength(selected.size);
  els.specimenNote.textContent = selected.note;
  els.previousObjectName.textContent = previous.name;
  els.nextObjectName.textContent = next.name;
  els.previousObjectButton.disabled = index === 0;
  els.nextObjectButton.disabled = index === OBJECTS.length - 1;
  const pinned = state.pinnedIds.includes(selected.id);
  els.pinButton.setAttribute('aria-pressed', String(pinned));
  els.pinButton.querySelector('b').textContent = pinned ? 'Закреплён' : 'Закрепить';
  els.pinCountBadge.textContent = String(state.pinnedIds.length);
  els.pinCountBadge.hidden = state.pinnedIds.length === 0;
}

function resizeCanvas(canvas, frame, type) {
  const rect = frame.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  if (type === 'scale') {
    scaleDpr = dpr;
    scaleSize = { width, height };
    scaleContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScale();
  } else {
    materialDpr = dpr;
    materialSize = { width, height };
    materialContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMaterials();
  }
}

function drawScale() {
  const ctx = scaleContext;
  const { width, height } = scaleSize;
  if (width <= 1 || height <= 1) return;
  ctx.clearRect(0, 0, width, height);

  const baselineY = height * 0.72;
  drawScaleGrid(ctx, width, height, baselineY);

  OBJECTS.forEach((object, index) => {
    const delta = objectLog(object) - currentLog;
    const x = width / 2 + delta * PX_PER_DECADE;
    if (x < -90 || x > width + 90) return;
    const selected = object.id === state.selectedId;
    const row = index % 3;
    const y = baselineY - 52 - row * 46;
    const decadeFraction = objectLog(object) - Math.floor(objectLog(object));
    const radius = 15 + decadeFraction * 13 + (selected ? 5 : 0);

    ctx.save();
    ctx.globalAlpha = selected ? 1 : clamp(1 - Math.abs(delta) * 0.16, 0.28, 0.88);
    if (selected) {
      ctx.beginPath();
      ctx.arc(x, y, radius + 13, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(196, 94, 62, .55)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    drawGlyph(ctx, object.glyph, x, y, radius, selected);
    ctx.strokeStyle = selected ? '#c45e3e' : 'rgba(21,47,51,.45)';
    ctx.lineWidth = selected ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(x, y + radius + 5);
    ctx.lineTo(x, baselineY - 4);
    ctx.stroke();
    ctx.fillStyle = selected ? '#152f33' : '#506164';
    ctx.textAlign = 'center';
    ctx.font = `${selected ? 800 : 650} ${selected ? 11 : 9}px system-ui, sans-serif`;
    ctx.fillText(object.name, x, Math.min(height - 9, y + radius + 18), 94);
    ctx.restore();
  });
}

function drawScaleGrid(ctx, width, height, baselineY) {
  ctx.save();
  ctx.strokeStyle = 'rgba(21,47,51,.12)';
  ctx.lineWidth = 1;
  for (let y = 20; y < height; y += 22) {
    ctx.beginPath();
    ctx.moveTo(0, y + .5);
    ctx.lineTo(width, y + .5);
    ctx.stroke();
  }

  const minOrder = Math.floor(currentLog - width / (2 * PX_PER_DECADE)) - 1;
  const maxOrder = Math.ceil(currentLog + width / (2 * PX_PER_DECADE)) + 1;
  for (let order = minOrder; order <= maxOrder; order += 1) {
    const x = width / 2 + (order - currentLog) * PX_PER_DECADE;
    ctx.strokeStyle = order === 0 ? 'rgba(196,94,62,.42)' : 'rgba(21,47,51,.28)';
    ctx.beginPath();
    ctx.moveTo(x + .5, 12);
    ctx.lineTo(x + .5, baselineY + 10);
    ctx.stroke();
    ctx.fillStyle = order === 0 ? '#c45e3e' : '#506164';
    ctx.textAlign = 'center';
    ctx.font = '800 10px system-ui, sans-serif';
    ctx.fillText(`10${superscript(order)}`, x, baselineY + 25);
    for (let minor = 2; minor < 10; minor += 1) {
      const minorX = x + Math.log10(minor) * PX_PER_DECADE;
      ctx.strokeStyle = 'rgba(21,47,51,.12)';
      ctx.beginPath();
      ctx.moveTo(minorX + .5, baselineY - 6);
      ctx.lineTo(minorX + .5, baselineY + 5);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = '#152f33';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, baselineY + .5);
  ctx.lineTo(width, baselineY + .5);
  ctx.stroke();
  ctx.restore();
}

function drawGlyph(ctx, glyph, x, y, radius, selected) {
  const ink = selected ? '#235b66' : '#314c50';
  const accent = selected ? '#c45e3e' : 'rgba(196,94,62,.72)';
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = ink;
  ctx.fillStyle = 'rgba(245,240,229,.92)';
  ctx.lineWidth = selected ? 2 : 1.4;

  if (['planet', 'star', 'atom', 'virus', 'cell', 'disc'].includes(glyph)) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  switch (glyph) {
    case 'atom':
      for (let turn = 0; turn < 3; turn += 1) {
        ctx.save();
        ctx.rotate(turn * Math.PI / 3);
        ctx.beginPath();
        ctx.ellipse(0, 0, radius, radius * .38, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'helix':
      ctx.beginPath();
      for (let i = -radius; i <= radius; i += 2) {
        const yy = i;
        const xx = Math.sin((i / radius) * Math.PI * 2) * radius * .42;
        i === -radius ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
      }
      ctx.stroke();
      ctx.beginPath();
      for (let i = -radius; i <= radius; i += 2) {
        const yy = i;
        const xx = -Math.sin((i / radius) * Math.PI * 2) * radius * .42;
        i === -radius ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
      }
      ctx.stroke();
      break;
    case 'cell':
      ctx.strokeStyle = accent;
      ctx.beginPath();
      ctx.arc(-radius * .25, radius * .08, radius * .28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(radius * .35, -radius * .18, radius * .13, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'virus':
      ctx.strokeStyle = accent;
      for (let i = 0; i < 10; i += 1) {
        const angle = (i / 10) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        ctx.lineTo(Math.cos(angle) * (radius + 6), Math.sin(angle) * (radius + 6));
        ctx.stroke();
      }
      break;
    case 'fiber':
      ctx.lineWidth = Math.max(3, radius * .25);
      ctx.beginPath();
      ctx.moveTo(-radius * .7, radius);
      ctx.bezierCurveTo(-radius, radius * .2, radius, -radius * .2, radius * .7, -radius);
      ctx.stroke();
      break;
    case 'crystal':
      polygon(ctx, 6, radius, Math.PI / 6);
      ctx.strokeStyle = accent;
      ctx.beginPath();
      ctx.moveTo(0, -radius);
      ctx.lineTo(0, radius);
      ctx.moveTo(-radius * .86, -radius * .5);
      ctx.lineTo(radius * .86, radius * .5);
      ctx.stroke();
      break;
    case 'creature':
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius * .42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.beginPath();
      ctx.moveTo(-radius * .45, radius * .2); ctx.lineTo(-radius * .8, radius * .7);
      ctx.moveTo(0, radius * .3); ctx.lineTo(0, radius * .85);
      ctx.moveTo(radius * .45, radius * .2); ctx.lineTo(radius * .8, radius * .7);
      ctx.stroke();
      break;
    case 'hand':
      ctx.beginPath();
      ctx.moveTo(-radius * .55, radius);
      ctx.lineTo(-radius * .55, -radius * .15);
      ctx.lineTo(-radius * .35, -radius * .15);
      ctx.lineTo(-radius * .35, -radius);
      ctx.lineTo(-radius * .1, -radius);
      ctx.lineTo(-radius * .1, -radius * .25);
      ctx.lineTo(radius * .15, -radius * .8);
      ctx.lineTo(radius * .35, -radius * .72);
      ctx.lineTo(radius * .23, -radius * .1);
      ctx.lineTo(radius * .72, -radius * .45);
      ctx.lineTo(radius * .85, -radius * .25);
      ctx.lineTo(radius * .48, radius * .12);
      ctx.lineTo(radius * .42, radius);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      break;
    case 'human':
      ctx.beginPath(); ctx.arc(0, -radius * .68, radius * .22, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -radius * .45); ctx.lineTo(0, radius * .35);
      ctx.moveTo(-radius * .58, -radius * .12); ctx.lineTo(radius * .58, -radius * .12);
      ctx.moveTo(0, radius * .35); ctx.lineTo(-radius * .42, radius);
      ctx.moveTo(0, radius * .35); ctx.lineTo(radius * .42, radius);
      ctx.stroke();
      break;
    case 'vehicle':
      ctx.beginPath();
      ctx.rect(-radius, -radius * .45, radius * 2, radius * .9);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(-radius * .58, radius * .55, radius * .22, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(radius * .58, radius * .55, radius * .22, 0, Math.PI * 2); ctx.fill();
      break;
    case 'field':
      ctx.beginPath(); ctx.rect(-radius, -radius * .62, radius * 2, radius * 1.24); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, radius * .28, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -radius * .62); ctx.lineTo(0, radius * .62); ctx.stroke();
      break;
    case 'tower':
      ctx.beginPath();
      ctx.moveTo(-radius * .62, radius);
      ctx.lineTo(-radius * .12, -radius * .75);
      ctx.lineTo(0, -radius);
      ctx.lineTo(radius * .12, -radius * .75);
      ctx.lineTo(radius * .62, radius);
      ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-radius * .45, radius * .35); ctx.lineTo(radius * .45, radius * .35); ctx.stroke();
      break;
    case 'mountain':
      ctx.beginPath();
      ctx.moveTo(-radius, radius);
      ctx.lineTo(-radius * .25, -radius * .35);
      ctx.lineTo(0, -radius);
      ctx.lineTo(radius * .22, -radius * .4);
      ctx.lineTo(radius, radius);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = accent; ctx.beginPath(); ctx.moveTo(-radius * .22, -radius * .3); ctx.lineTo(0, -radius); ctx.lineTo(radius * .25, -radius * .36); ctx.stroke();
      break;
    case 'city':
      for (let i = -2; i <= 2; i += 1) {
        const h = radius * (.55 + (i % 2 ? .25 : .65));
        ctx.strokeRect(i * radius * .36 - radius * .15, radius - h, radius * .3, h);
      }
      break;
    case 'land':
      ctx.beginPath();
      ctx.moveTo(-radius * .8, -radius * .35); ctx.bezierCurveTo(-radius * .2, -radius, radius * .25, -radius * .45, radius * .8, -radius * .7);
      ctx.bezierCurveTo(radius * .55, 0, radius * .85, radius * .35, radius * .25, radius * .85);
      ctx.bezierCurveTo(-radius * .2, radius * .55, -radius * .65, radius, -radius * .8, -radius * .35); ctx.stroke();
      break;
    case 'planet':
      ctx.strokeStyle = accent;
      ctx.beginPath(); ctx.ellipse(0, 0, radius * 1.45, radius * .35, -.2, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'star':
      ctx.fillStyle = accent;
      star(ctx, 8, radius, radius * .42); ctx.fill();
      break;
    case 'orbit':
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath(); ctx.ellipse(0, 0, radius * (1 - i * .18), radius * (.35 + i * .11), -.2, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
      break;
    case 'beam':
      ctx.strokeStyle = accent; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-radius, radius * .4); ctx.lineTo(radius, -radius * .4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(radius * .45, -radius * .7); ctx.lineTo(radius, -radius * .4); ctx.lineTo(radius * .62, radius * .05); ctx.stroke();
      break;
    case 'cloud':
    case 'stars':
    case 'cluster':
    case 'web':
    case 'universe':
    case 'galaxy':
      drawCosmicGlyph(ctx, glyph, radius, ink, accent);
      break;
    default:
      ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawCosmicGlyph(ctx, glyph, radius, ink, accent) {
  const count = glyph === 'universe' ? 18 : glyph === 'web' ? 13 : 9;
  const points = [];
  for (let index = 0; index < count; index += 1) {
    const angle = index * 2.399963;
    const distance = radius * Math.sqrt((index + 1) / count) * .95;
    points.push({ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance * .68 });
  }
  if (['web', 'cluster', 'universe'].includes(glyph)) {
    ctx.strokeStyle = 'rgba(35,91,102,.5)';
    ctx.lineWidth = 1;
    points.forEach((point, index) => {
      const next = points[(index * 3 + 4) % points.length];
      ctx.beginPath(); ctx.moveTo(point.x, point.y); ctx.lineTo(next.x, next.y); ctx.stroke();
    });
  }
  if (glyph === 'galaxy') {
    ctx.strokeStyle = ink;
    for (let arm = 0; arm < 3; arm += 1) {
      ctx.beginPath();
      for (let step = 0; step < 22; step += 1) {
        const angle = arm * Math.PI * 2 / 3 + step * .24;
        const distance = step / 22 * radius;
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance * .56;
        step ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }
  points.forEach((point, index) => {
    ctx.fillStyle = index % 4 === 0 ? accent : ink;
    ctx.beginPath(); ctx.arc(point.x, point.y, index % 3 === 0 ? 2.3 : 1.35, 0, Math.PI * 2); ctx.fill();
  });
}

function polygon(ctx, sides, radius, rotation = 0) {
  ctx.beginPath();
  for (let index = 0; index < sides; index += 1) {
    const angle = rotation + index / sides * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function star(ctx, points, outerRadius, innerRadius) {
  ctx.beginPath();
  for (let index = 0; index < points * 2; index += 1) {
    const radius = index % 2 ? innerRadius : outerRadius;
    const angle = -Math.PI / 2 + index * Math.PI / points;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function jumpToObject(object, feedback = true) {
  if (!object) return;
  targetLog = clamp(objectLog(object), MIN_LOG_SCALE, MAX_LOG_SCALE);
  state.selectedId = object.id;
  state.logScale = targetLog;
  if (feedback) {
    playTick(520, .04, .024);
    haptic(12);
  }
  saveState();
  scheduleRender();
}

function stepObject(direction) {
  const selected = objectById(state.selectedId) || nearestObject(currentLog);
  const index = OBJECTS.findIndex((object) => object.id === selected.id);
  jumpToObject(OBJECTS[clamp(index + direction, 0, OBJECTS.length - 1)]);
}

function togglePin() {
  const selected = objectById(state.selectedId);
  if (!selected) return;
  const index = state.pinnedIds.indexOf(selected.id);
  if (index >= 0) {
    state.pinnedIds.splice(index, 1);
    showToast(`${selected.name}: снято со стенда`);
  } else {
    if (state.pinnedIds.length >= 4) {
      state.pinnedIds.shift();
      showToast('Стенд вмещает четыре объекта: самый старый снят');
    } else {
      showToast(`${selected.name}: закреплено`);
    }
    state.pinnedIds.push(selected.id);
    state.compareBaseId ||= selected.id;
  }
  haptic(index >= 0 ? 8 : [8, 22, 12]);
  playTick(index >= 0 ? 360 : 620, .03, .02);
  saveState();
  updateScaleUi();
  renderComparison();
}

function setScreen(name) {
  if (!['scale', 'compare', 'matter'].includes(name)) return;
  state.screen = name;
  document.querySelectorAll('.screen').forEach((screen) => {
    const active = screen.id === `${name}Screen`;
    screen.hidden = !active;
    screen.classList.toggle('is-active', active);
  });
  document.querySelectorAll('[data-screen]').forEach((button) => button.classList.toggle('is-active', button.dataset.screen === name));
  saveState();
  if (name === 'scale') {
    requestAnimationFrame(() => resizeCanvas(els.scaleCanvas, els.stageWrap, 'scale'));
  } else if (name === 'compare') {
    renderComparison();
  } else {
    requestAnimationFrame(() => resizeCanvas(els.materialCanvas, els.materialStage, 'material'));
    renderMaterials();
  }
}

function renderComparison() {
  const pinned = state.pinnedIds.map(objectById).filter(Boolean).sort((a, b) => a.size - b.size);
  const enough = pinned.length >= 2;
  els.compareEmpty.hidden = enough;
  els.compareRack.hidden = !enough;
  els.compareSummary.hidden = !enough;
  els.clearPinsButton.disabled = pinned.length === 0;
  els.pinCountBadge.textContent = String(pinned.length);
  els.pinCountBadge.hidden = pinned.length === 0;
  if (!enough) return;

  const smallest = pinned[0];
  const largest = pinned.at(-1);
  const ratio = largest.size / smallest.size;
  const base = pinned.find((object) => object.id === state.compareBaseId) || smallest;
  state.compareBaseId = base.id;
  els.compareSummary.innerHTML = `
    <strong>${largest.name} больше ${smallest.name} в ${formatCompact(ratio)} раз</strong>
    <p>Полосы логарифмические: иначе ${smallest.name.toLowerCase()} превратился бы в математически честную, но бесполезную пылинку.</p>
  `;

  const minLog = objectLog(smallest);
  const maxLog = objectLog(largest);
  const spread = Math.max(.01, maxLog - minLog);
  els.compareRack.innerHTML = pinned.map((object, index) => {
    const width = 14 + ((objectLog(object) - minLog) / spread) * 86;
    const baseRatio = object.size / base.size;
    return `
      <article class="compare-item" data-object-id="${object.id}">
        <div class="compare-rank">${index + 1}</div>
        <div class="compare-copy">
          <small>${object.group}</small>
          <strong>${object.name}</strong>
          <span>${formatLength(object.size)} · к базе ${formatRatio(baseRatio)}</span>
        </div>
        <div class="compare-actions">
          <button type="button" data-set-base="${object.id}" data-native-press>${object.id === base.id ? 'База' : 'Сделать базой'}</button>
          <button type="button" class="remove" data-remove-pin="${object.id}" data-native-press>Снять</button>
        </div>
        <i class="measure-bar" style="width:${width}%"></i>
      </article>
    `;
  }).join('');
}

function removePin(id) {
  state.pinnedIds = state.pinnedIds.filter((candidate) => candidate !== id);
  if (state.compareBaseId === id) state.compareBaseId = state.pinnedIds[0] || 'human';
  saveState();
  renderComparison();
  updateScaleUi();
  haptic(8);
}

function clearPins() {
  state.pinnedIds = [];
  state.compareBaseId = 'human';
  saveState();
  renderComparison();
  updateScaleUi();
  haptic([10, 20, 10]);
  showToast('Измерительный стенд очищен');
}

function renderMaterials() {
  const massKg = massFromLog(state.massLogKg);
  const selected = materialById(state.materialId);
  const side = cubeSideForMass(massKg, selected.density);
  els.massSlider.value = String(state.massLogKg);
  els.massValue.textContent = formatMass(massKg);
  els.materialDensity.textContent = `${selected.density.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} кг/м³`;
  els.materialName.textContent = selected.name;
  els.materialSide.textContent = formatLength(side);
  els.materialNote.textContent = selected.note;
  els.materialList.innerHTML = MATERIALS.map((material) => {
    const materialSide = cubeSideForMass(massKg, material.density);
    return `<button type="button" class="material-chip ${material.id === selected.id ? 'is-active' : ''}" data-material-id="${material.id}" data-native-press><strong>${material.name}</strong><small>${formatLength(materialSide)}</small></button>`;
  }).join('');
  drawMaterials();
}

function formatMass(massKg) {
  if (massKg < 0.001) return `${Math.round(massKg * 1e6)} мг`;
  if (massKg < 1) return `${formatNumber(massKg * 1000)} г`;
  if (massKg < 1000) return `${formatNumber(massKg)} кг`;
  return `${formatNumber(massKg / 1000)} т`;
}

function formatNumber(value) {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: value < 10 ? 2 : value < 100 ? 1 : 0 });
}

function drawMaterials() {
  const ctx = materialContext;
  const { width, height } = materialSize;
  if (width <= 1 || height <= 1) return;
  ctx.clearRect(0, 0, width, height);
  const massKg = massFromLog(state.massLogKg);
  const sides = MATERIALS.map((material) => ({ material, side: cubeSideForMass(massKg, material.density) }));
  const maxSide = Math.max(...sides.map((entry) => entry.side));
  const floorY = height - 34;
  const slotWidth = width / sides.length;
  const available = Math.min(height * .58, slotWidth * 1.75);
  const margin = available / 2 + 6;
  const spacing = sides.length > 1 ? (width - margin * 2) / (sides.length - 1) : 0;

  ctx.save();
  ctx.strokeStyle = 'rgba(21,47,51,.18)';
  ctx.lineWidth = 1;
  for (let y = 18; y < floorY; y += 22) {
    ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(width, y + .5); ctx.stroke();
  }
  ctx.strokeStyle = '#152f33';
  ctx.beginPath(); ctx.moveTo(0, floorY + .5); ctx.lineTo(width, floorY + .5); ctx.stroke();

  sides.forEach(({ material, side }, index) => {
    const selected = material.id === state.materialId;
    const visual = clamp((side / maxSide) * available, 8, available);
    const x = margin + spacing * index;
    const y = floorY - visual;
    drawCube(ctx, x, y, visual, selected, index);
    ctx.fillStyle = selected ? '#152f33' : '#506164';
    ctx.font = `${selected ? 800 : 650} ${selected ? 9 : 7.5}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(material.name, x, floorY + 14, Math.max(32, slotWidth - 3));
  });
  ctx.restore();
}

function drawCube(ctx, centerX, topY, side, selected, index) {
  const depth = clamp(side * .28, 3, 17);
  const left = centerX - side / 2;
  const right = centerX + side / 2;
  const bottom = topY + side;
  ctx.save();
  ctx.lineWidth = selected ? 2 : 1;
  ctx.strokeStyle = selected ? '#c45e3e' : 'rgba(21,47,51,.65)';
  ctx.fillStyle = selected ? 'rgba(35,91,102,.34)' : `rgba(35,91,102,${.08 + index * .018})`;
  ctx.beginPath();
  ctx.rect(left, topY, side, side);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = selected ? 'rgba(196,94,62,.2)' : 'rgba(21,47,51,.08)';
  ctx.beginPath();
  ctx.moveTo(left, topY);
  ctx.lineTo(left + depth, topY - depth);
  ctx.lineTo(right + depth, topY - depth);
  ctx.lineTo(right, topY);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(right, topY);
  ctx.lineTo(right + depth, topY - depth);
  ctx.lineTo(right + depth, bottom - depth);
  ctx.lineTo(right, bottom);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  if (selected) {
    ctx.strokeStyle = 'rgba(196,94,62,.45)';
    ctx.beginPath(); ctx.arc(centerX + depth * .25, topY + side * .5 - depth * .25, side * .68, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function renderObjectCatalog(query = '') {
  const normalized = query.trim().toLocaleLowerCase('ru');
  const objects = OBJECTS.filter((object) => `${object.name} ${object.group}`.toLocaleLowerCase('ru').includes(normalized));
  els.objectCatalog.innerHTML = objects.length ? objects.map((object) => {
    const exponent = Math.floor(objectLog(object));
    return `<button class="catalog-item" type="button" data-catalog-id="${object.id}" data-native-press><span class="catalog-order">10${superscript(exponent)}</span><span><strong>${object.name}</strong><small>${object.group}</small></span><span>${formatLength(object.size)}</span></button>`;
  }).join('') : '<div class="catalog-empty">Ничего не найдено. У Вселенной огромный каталог, но здесь пока только характерные ориентиры.</div>';
}

function openSheet(sheet) {
  closeSheets();
  els.sheetBackdrop.hidden = false;
  sheet.hidden = false;
}

function closeSheets() {
  els.sheetBackdrop.hidden = true;
  document.querySelectorAll('.bottom-sheet').forEach((sheet) => { sheet.hidden = true; });
}

function openModal(modal) {
  closeModals();
  modal.hidden = false;
}

function closeModals() {
  document.querySelectorAll('.modal').forEach((modal) => { modal.hidden = true; });
}

function showGuide() {
  closeSheets();
  openModal(els.guideModal);
}

function resetLaboratory() {
  state = sanitizeState(cloneDefaults());
  currentLog = state.logScale;
  targetLog = currentLog;
  lastOrder = Math.floor(currentLog);
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  closeModals();
  closeSheets();
  renderComparison();
  renderMaterials();
  setScreen('scale');
  scheduleRender();
  haptic([15, 30, 20]);
  showToast('Лаборатория возвращена к человеческому масштабу');
}

function handleScalePointerDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
  els.scaleCanvas.setPointerCapture?.(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
  directInteraction = true;
  movedDuringGesture = false;
  selectedBeforeGesture = state.selectedId;
  if (pointers.size === 1) {
    dragStart = { x: event.clientX, log: currentLog };
    pinchStart = null;
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchStart = { distance: Math.hypot(a.x - b.x, a.y - b.y), log: currentLog };
    dragStart = null;
  }
  els.stageHint.classList.add('is-faded');
}

function handleScalePointerMove(event) {
  const pointer = pointers.get(event.pointerId);
  if (!pointer) return;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  const moved = Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY);
  if (moved > 7) movedDuringGesture = true;

  if (pointers.size === 1 && dragStart) {
    const dx = event.clientX - dragStart.x;
    currentLog = clamp(dragStart.log - dx / PX_PER_DECADE, MIN_LOG_SCALE, MAX_LOG_SCALE);
    targetLog = currentLog;
  } else if (pointers.size >= 2 && pinchStart) {
    const [a, b] = [...pointers.values()];
    const distance = Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
    const change = Math.log2(distance / Math.max(20, pinchStart.distance));
    currentLog = clamp(pinchStart.log - change * 1.5, MIN_LOG_SCALE, MAX_LOG_SCALE);
    targetLog = currentLog;
    movedDuringGesture = true;
  }
  updateOrderFeedback();
  updateSelectedFromScale();
  drawScale();
  updateScaleUi();
  saveState();
}

function handleScalePointerUp(event) {
  const pointer = pointers.get(event.pointerId);
  pointers.delete(event.pointerId);
  try { els.scaleCanvas.releasePointerCapture?.(event.pointerId); } catch {}

  if (!movedDuringGesture && pointer) {
    const rect = els.scaleCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    let best = null;
    let bestDistance = 34;
    OBJECTS.forEach((object) => {
      const objectX = scaleSize.width / 2 + (objectLog(object) - currentLog) * PX_PER_DECADE;
      const distance = Math.abs(objectX - x);
      if (distance < bestDistance) { best = object; bestDistance = distance; }
    });
    if (best) jumpToObject(best);
  }

  if (pointers.size === 1) {
    const remaining = [...pointers.values()][0];
    dragStart = { x: remaining.x, log: currentLog };
    pinchStart = null;
  } else if (pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    pinchStart = { distance: Math.hypot(a.x - b.x, a.y - b.y), log: currentLog };
    dragStart = null;
  } else {
    directInteraction = false;
    dragStart = null;
    pinchStart = null;
    state.logScale = currentLog;
    saveState();
    if (selectedBeforeGesture !== state.selectedId) playTick(500, .025, .015);
    scheduleRender();
  }
}

function bindEvents() {
  els.scaleCanvas.addEventListener('pointerdown', handleScalePointerDown);
  els.scaleCanvas.addEventListener('pointermove', handleScalePointerMove);
  els.scaleCanvas.addEventListener('pointerup', handleScalePointerUp);
  els.scaleCanvas.addEventListener('pointercancel', handleScalePointerUp);
  els.scaleCanvas.addEventListener('lostpointercapture', (event) => {
    if (pointers.has(event.pointerId)) handleScalePointerUp(event);
  });

  els.smallerButton.addEventListener('click', () => {
    targetLog = clamp(targetLog - 1, MIN_LOG_SCALE, MAX_LOG_SCALE);
    playTick(370, .025, .016);
    fadeHint();
    scheduleRender();
    saveState();
  });
  els.largerButton.addEventListener('click', () => {
    targetLog = clamp(targetLog + 1, MIN_LOG_SCALE, MAX_LOG_SCALE);
    playTick(520, .025, .016);
    fadeHint();
    scheduleRender();
    saveState();
  });
  els.previousObjectButton.addEventListener('click', () => stepObject(-1));
  els.nextObjectButton.addEventListener('click', () => stepObject(1));
  els.pinButton.addEventListener('click', togglePin);

  els.jumpButton.addEventListener('click', () => {
    renderObjectCatalog();
    els.objectSearch.value = '';
    openSheet(els.objectSheet);
  });
  els.objectSearch.addEventListener('input', () => renderObjectCatalog(els.objectSearch.value));
  els.objectCatalog.addEventListener('click', (event) => {
    const target = event.target.closest('[data-catalog-id]');
    if (!target) return;
    const object = objectById(target.dataset.catalogId);
    closeSheets();
    setScreen('scale');
    jumpToObject(object);
  });

  document.querySelectorAll('[data-screen]').forEach((button) => button.addEventListener('click', () => {
    playTick(390 + [...document.querySelectorAll('[data-screen]')].indexOf(button) * 80, .022, .014);
    setScreen(button.dataset.screen);
  }));
  document.querySelectorAll('[data-open-scale]').forEach((button) => button.addEventListener('click', () => setScreen('scale')));

  els.compareRack.addEventListener('click', (event) => {
    const baseButton = event.target.closest('[data-set-base]');
    if (baseButton) {
      state.compareBaseId = baseButton.dataset.setBase;
      saveState();
      renderComparison();
      haptic(8);
      return;
    }
    const removeButton = event.target.closest('[data-remove-pin]');
    if (removeButton) removePin(removeButton.dataset.removePin);
  });
  els.clearPinsButton.addEventListener('click', clearPins);

  els.massSlider.addEventListener('input', () => {
    state.massLogKg = clamp(Number(els.massSlider.value), -3, 3);
    saveState();
    renderMaterials();
  });
  els.massSlider.addEventListener('change', () => {
    haptic(8);
    playTick(460, .025, .014);
  });
  els.materialList.addEventListener('click', (event) => {
    const target = event.target.closest('[data-material-id]');
    if (!target) return;
    state.materialId = target.dataset.materialId;
    saveState();
    renderMaterials();
    haptic(7);
    playTick(580, .025, .016);
  });
  els.materialCanvas.addEventListener('click', (event) => {
    const rect = els.materialCanvas.getBoundingClientRect();
    const index = clamp(Math.floor(((event.clientX - rect.left) / rect.width) * MATERIALS.length), 0, MATERIALS.length - 1);
    state.materialId = MATERIALS[index].id;
    saveState();
    renderMaterials();
    haptic(7);
  });

  els.settingsButton.addEventListener('click', () => openSheet(els.settingsSheet));
  els.sheetBackdrop.addEventListener('click', closeSheets);
  document.querySelectorAll('[data-close-sheet]').forEach((button) => button.addEventListener('click', closeSheets));
  document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModals));
  els.soundToggle.addEventListener('change', () => {
    state.settings.sound = els.soundToggle.checked;
    saveState();
    playTick(540, .03, .02);
  });
  els.hapticsToggle.addEventListener('change', () => {
    state.settings.haptics = els.hapticsToggle.checked;
    saveState();
    haptic(12);
  });
  els.showGuideButton.addEventListener('click', showGuide);
  els.resetButton.addEventListener('click', () => { closeSheets(); openModal(els.resetModal); });
  els.confirmResetButton.addEventListener('click', resetLaboratory);
  els.startButton.addEventListener('click', () => {
    state.onboarded = true;
    closeModals();
    jumpToObject(objectById('human'));
    saveState();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (![...document.querySelectorAll('.modal')].every((modal) => modal.hidden)) closeModals();
      else closeSheets();
    }
    if (state.screen !== 'scale') return;
    if (event.key === 'ArrowLeft') stepObject(-1);
    if (event.key === 'ArrowRight') stepObject(1);
    if (event.key === '-' || event.key === '_') {
      targetLog = clamp(targetLog - 1, MIN_LOG_SCALE, MAX_LOG_SCALE);
      scheduleRender();
    }
    if (event.key === '+' || event.key === '=') {
      targetLog = clamp(targetLog + 1, MIN_LOG_SCALE, MAX_LOG_SCALE);
      scheduleRender();
    }
  });

  window.addEventListener('pagehide', () => {
    state.logScale = currentLog;
    saveState();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      state.logScale = currentLog;
      saveState();
      pointers.clear();
      directInteraction = false;
    } else {
      scheduleRender();
    }
  });
  window.addEventListener('appdatareset', resetLaboratory);
}

function setup() {
  bindEvents();
  const scaleObserver = new ResizeObserver(() => resizeCanvas(els.scaleCanvas, els.stageWrap, 'scale'));
  const materialObserver = new ResizeObserver(() => resizeCanvas(els.materialCanvas, els.materialStage, 'material'));
  scaleObserver.observe(els.stageWrap);
  materialObserver.observe(els.materialStage);

  els.soundToggle.checked = state.settings.sound;
  els.hapticsToggle.checked = state.settings.haptics;
  els.massSlider.value = String(state.massLogKg);
  renderObjectCatalog();
  renderComparison();
  renderMaterials();
  setScreen(state.screen);

  createWorkshopMode({
    appName: 'ПОРЯДОК',
    version: APP_VERSION,
    cachePrefix: 'poryadok-',
    storageNamespace: STORAGE_NAMESPACE,
    onReset() {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      state = sanitizeState(cloneDefaults());
      currentLog = state.logScale;
      targetLog = currentLog;
      renderComparison();
      renderMaterials();
      setScreen('scale');
      scheduleRender();
    }
  });

  watchConnectivity((online) => {
    document.documentElement.dataset.network = online ? 'online' : 'offline';
  });

  if (!state.onboarded) openModal(els.guideModal);
  scheduleRender();
}

setup();
