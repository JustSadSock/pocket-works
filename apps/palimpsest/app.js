import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  INTERVENTIONS,
  applyIntervention,
  createWorld,
  getStateSummary,
  getWorldLeaders,
  hydrateWorld,
  relation,
  rewindWorld,
  serializeWorld,
  stepWorld
} from './core.js';

installMobileRuntime();

const store = createVersionedStore({
  namespace: 'pocket-works:palimpsest',
  version: 1,
  defaults: {
    world: null,
    sound: true,
    hintSeen: false
  }
});

const canvas = document.querySelector('#mapCanvas');
const context = canvas.getContext('2d', { alpha: false });
const mapFrame = document.querySelector('#mapFrame');
const mapEmpty = document.querySelector('#mapEmpty');
const yearValue = document.querySelector('#yearValue');
const branchValue = document.querySelector('#branchValue');
const stateSwatch = document.querySelector('#stateSwatch');
const stateName = document.querySelector('#stateName');
const areaValue = document.querySelector('#areaValue');
const armyValue = document.querySelector('#armyValue');
const stabilityValue = document.querySelector('#stabilityValue');
const influenceValue = document.querySelector('#influenceValue');
const sealStatus = document.querySelector('#sealStatus');
const actionFeedback = document.querySelector('#actionFeedback');
const advanceYear = document.querySelector('#advanceYear');
const advanceButton = document.querySelector('#advanceButton');
const timelineTrack = document.querySelector('#timelineTrack');
const chronicleList = document.querySelector('#chronicleList');
const gestureHint = document.querySelector('#gestureHint');
const settingsSheet = document.querySelector('#settingsSheet');
const confirmModal = document.querySelector('#confirmModal');
const milestoneModal = document.querySelector('#milestoneModal');
const eraSummary = document.querySelector('#eraSummary');
const soundToggle = document.querySelector('#soundToggle');

const lawInputs = {
  war: document.querySelector('#warLaw'),
  revolt: document.querySelector('#revoltLaw'),
  trade: document.querySelector('#tradeLaw')
};
const lawOutputs = {
  war: document.querySelector('#warLawValue'),
  revolt: document.querySelector('#revoltLawValue'),
  trade: document.querySelector('#tradeLawValue')
};

let world = hydrateWorld(store.get('world')) ?? createWorld();
let soundEnabled = store.get('sound', true) !== false;
let audioContext = null;
let drawQueued = false;
let animationUntil = 0;
let pulseStateIds = [];
let transform = { scale: 1, x: 0, y: 0 };
const pointers = new Map();
let pointerGesture = null;
let canvasSize = { width: 1, height: 1, dpr: 1 };

function persist() {
  store.patch({ world: serializeWorld(world), sound: soundEnabled });
}

function haptic(pattern = 12) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function ensureAudio() {
  if (!soundEnabled) return null;
  if (!audioContext) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (AudioCtor) audioContext = new AudioCtor();
  }
  if (audioContext?.state === 'suspended') audioContext.resume().catch(() => {});
  return audioContext;
}

function tone(frequency, duration = 0.08, gain = 0.025, type = 'sine') {
  const audio = ensureAudio();
  if (!audio) return;
  const now = audio.currentTime;
  const oscillator = audio.createOscillator();
  const volume = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  volume.gain.setValueAtTime(0.0001, now);
  volume.gain.exponentialRampToValueAtTime(gain, now + 0.012);
  volume.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(volume).connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function playSeal() {
  tone(138, 0.09, 0.035, 'triangle');
  setTimeout(() => tone(92, 0.11, 0.025, 'sine'), 35);
}

function playTurn() {
  tone(246, 0.07, 0.018, 'triangle');
  setTimeout(() => tone(310, 0.08, 0.018, 'triangle'), 80);
}

function setFeedback(text, isError = false) {
  actionFeedback.textContent = text;
  actionFeedback.classList.toggle('is-error', isError);
}

function selectState(stateId) {
  const state = world.states.find((item) => item.id === stateId && item.alive);
  if (!state) return;
  world.selectedStateId = state.id;
  pulseStateIds = [state.id];
  animationUntil = performance.now() + 420;
  gestureHint.classList.add('is-hidden');
  store.set('hintSeen', true);
  haptic(8);
  render();
  persist();
}

function getSelected() {
  let selected = getStateSummary(world, world.selectedStateId);
  if (!selected || !selected.alive || selected.area < 1) {
    const first = world.states.find((state) => state.alive && getStateSummary(world, state.id)?.area > 0);
    if (first) {
      world.selectedStateId = first.id;
      selected = getStateSummary(world, first.id);
    }
  }
  return selected;
}

function hexPosition(cell) {
  const radius = 21;
  return {
    x: radius * Math.sqrt(3) * (cell.q + cell.r / 2),
    y: radius * 1.5 * cell.r,
    radius
  };
}

function mapBounds() {
  const points = world.cells.map(hexPosition);
  const minX = Math.min(...points.map((p) => p.x - p.radius));
  const maxX = Math.max(...points.map((p) => p.x + p.radius));
  const minY = Math.min(...points.map((p) => p.y - p.radius));
  const maxY = Math.max(...points.map((p) => p.y + p.radius));
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

function fitMap() {
  const bounds = mapBounds();
  const padding = 18;
  const scale = Math.min(
    (canvasSize.width - padding * 2) / bounds.width,
    (canvasSize.height - padding * 2) / bounds.height
  );
  transform.scale = Math.max(0.55, Math.min(1.8, scale));
  transform.x = canvasSize.width / 2 - ((bounds.minX + bounds.maxX) / 2) * transform.scale;
  transform.y = canvasSize.height / 2 - ((bounds.minY + bounds.maxY) / 2) * transform.scale;
  queueDraw();
}

function clampTransform() {
  const bounds = mapBounds();
  const margin = 70;
  const mapLeft = bounds.minX * transform.scale + transform.x;
  const mapRight = bounds.maxX * transform.scale + transform.x;
  const mapTop = bounds.minY * transform.scale + transform.y;
  const mapBottom = bounds.maxY * transform.scale + transform.y;
  if (mapRight < margin) transform.x += margin - mapRight;
  if (mapLeft > canvasSize.width - margin) transform.x -= mapLeft - (canvasSize.width - margin);
  if (mapBottom < margin) transform.y += margin - mapBottom;
  if (mapTop > canvasSize.height - margin) transform.y -= mapTop - (canvasSize.height - margin);
}

function hexPath(ctx, x, y, radius) {
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = Math.PI / 180 * (60 * i - 30);
    const px = x + radius * Math.cos(angle);
    const py = y + radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function stateById(id) {
  return world.states.find((state) => state.id === id);
}

function drawRelations(ctx) {
  const capitals = new Map();
  for (const state of world.states) {
    if (!state.alive) continue;
    const cell = world.cells[state.capitalIndex];
    if (!cell || cell.owner !== state.id) continue;
    capitals.set(state.id, hexPosition(cell));
  }
  ctx.save();
  ctx.lineCap = 'round';
  for (const [aId, aPoint] of capitals.entries()) {
    for (const [bId, bPoint] of capitals.entries()) {
      if (aId >= bId) continue;
      const value = relation(world, aId, bId);
      if (value > 68) {
        ctx.strokeStyle = 'rgba(36, 67, 53, .52)';
        ctx.lineWidth = 2 / transform.scale;
        ctx.setLineDash([]);
      } else if (value < -48) {
        ctx.strokeStyle = 'rgba(120, 40, 32, .56)';
        ctx.lineWidth = 2.2 / transform.scale;
        ctx.setLineDash([6 / transform.scale, 5 / transform.scale]);
      } else continue;
      ctx.beginPath();
      ctx.moveTo(aPoint.x, aPoint.y);
      const midX = (aPoint.x + bPoint.x) / 2;
      const midY = (aPoint.y + bPoint.y) / 2 - 14;
      ctx.quadraticCurveTo(midX, midY, bPoint.x, bPoint.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawMap(timestamp = performance.now()) {
  drawQueued = false;
  if (!context || !world?.cells?.length) {
    mapEmpty.hidden = false;
    return;
  }
  mapEmpty.hidden = true;
  const ctx = context;
  const { width, height, dpr } = canvasSize;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const waterGradient = ctx.createLinearGradient(0, 0, 0, height);
  waterGradient.addColorStop(0, '#bdc9c2');
  waterGradient.addColorStop(1, '#aab8b0');
  ctx.fillStyle = waterGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.scale, transform.scale);

  for (const cell of world.cells) {
    const point = hexPosition(cell);
    hexPath(ctx, point.x, point.y, point.radius + 0.3);
    if (!cell.land) {
      ctx.fillStyle = 'rgba(210, 224, 217, .16)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(74, 91, 83, .13)';
      ctx.lineWidth = 0.7 / transform.scale;
      ctx.stroke();
      continue;
    }
    const state = stateById(cell.owner);
    ctx.fillStyle = state?.color ?? '#8b8574';
    ctx.globalAlpha = 0.86;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(43, 39, 31, .16)';
    ctx.lineWidth = 0.6 / transform.scale;
    ctx.stroke();
  }

  for (let index = 0; index < world.cells.length; index += 1) {
    const cell = world.cells[index];
    if (!cell.land) continue;
    const point = hexPosition(cell);
    const neighbors = [
      [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]
    ];
    for (let side = 0; side < neighbors.length; side += 1) {
      const [dq, dr] = neighbors[side];
      const ni = world.cellIndex[`${cell.q + dq},${cell.r + dr}`];
      const other = ni === undefined ? null : world.cells[ni];
      if (other && other.land && other.owner === cell.owner) continue;
      const a1 = Math.PI / 180 * (60 * side - 30);
      const a2 = Math.PI / 180 * (60 * (side + 1) - 30);
      ctx.beginPath();
      ctx.moveTo(point.x + point.radius * Math.cos(a1), point.y + point.radius * Math.sin(a1));
      ctx.lineTo(point.x + point.radius * Math.cos(a2), point.y + point.radius * Math.sin(a2));
      ctx.strokeStyle = other?.land ? 'rgba(38, 34, 27, .72)' : 'rgba(46, 49, 42, .38)';
      ctx.lineWidth = (other?.land ? 1.6 : 1.1) / transform.scale;
      ctx.stroke();
    }
  }

  drawRelations(ctx);

  for (const state of world.states) {
    if (!state.alive) continue;
    const capitalCell = world.cells[state.capitalIndex];
    if (!capitalCell || capitalCell.owner !== state.id) continue;
    const point = hexPosition(capitalCell);
    const selected = state.id === world.selectedStateId;
    if (selected) {
      const phase = timestamp < animationUntil ? (1 - (animationUntil - timestamp) / 420) : 1;
      const pulse = 13 + Math.sin(phase * Math.PI * 2) * 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, pulse, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(39, 35, 28, .9)';
      ctx.lineWidth = 2.2 / transform.scale;
      ctx.stroke();
    }
    if (pulseStateIds.includes(state.id) && timestamp < animationUntil) {
      const t = 1 - (animationUntil - timestamp) / 420;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 9 + t * 25, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(159, 53, 43, ${1 - t})`;
      ctx.lineWidth = 2.5 / transform.scale;
      ctx.stroke();
    }
    ctx.fillStyle = '#efe6d4';
    ctx.strokeStyle = '#2a2720';
    ctx.lineWidth = 1.6 / transform.scale;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = state.color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const cell of world.cells) {
    if (!cell.city || cell.capital || !cell.land) continue;
    const point = hexPosition(cell);
    ctx.fillStyle = '#2a2720';
    ctx.fillRect(point.x - 1.5, point.y - 1.5, 3, 3);
  }

  ctx.restore();
  if (timestamp < animationUntil) requestAnimationFrame(drawMap);
}

function queueDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(drawMap);
}

function resizeCanvas() {
  const rect = mapFrame.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  canvasSize = { width: rect.width, height: rect.height, dpr };
  fitMap();
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function worldPoint(point) {
  return {
    x: (point.x - transform.x) / transform.scale,
    y: (point.y - transform.y) / transform.scale
  };
}

function stateAtPoint(point) {
  const target = worldPoint(point);
  let best = null;
  let bestDistance = Infinity;
  for (const cell of world.cells) {
    if (!cell.land || cell.owner < 0) continue;
    const pos = hexPosition(cell);
    const distance = Math.hypot(pos.x - target.x, pos.y - target.y);
    if (distance < bestDistance && distance <= pos.radius * 1.08) {
      bestDistance = distance;
      best = cell.owner;
    }
  }
  return best;
}

function pointerDown(event) {
  mapFrame.setPointerCapture?.(event.pointerId);
  const point = canvasPoint(event);
  pointers.set(event.pointerId, point);
  if (pointers.size === 1) {
    pointerGesture = {
      type: 'single',
      start: point,
      last: point,
      moved: false,
      startTransform: { ...transform }
    };
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    pointerGesture = {
      type: 'pinch',
      distance,
      midpoint,
      worldMidpoint: worldPoint(midpoint),
      startTransform: { ...transform }
    };
  }
}

function pointerMove(event) {
  if (!pointers.has(event.pointerId)) return;
  const point = canvasPoint(event);
  pointers.set(event.pointerId, point);
  if (pointers.size >= 2 && pointerGesture?.type === 'pinch') {
    const [a, b] = [...pointers.values()];
    const distance = Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const scale = Math.max(0.5, Math.min(3.2, pointerGesture.startTransform.scale * distance / pointerGesture.distance));
    transform.scale = scale;
    transform.x = midpoint.x - pointerGesture.worldMidpoint.x * scale;
    transform.y = midpoint.y - pointerGesture.worldMidpoint.y * scale;
    clampTransform();
    queueDraw();
    return;
  }
  if (pointers.size === 1 && pointerGesture?.type === 'single') {
    const dx = point.x - pointerGesture.last.x;
    const dy = point.y - pointerGesture.last.y;
    if (Math.hypot(point.x - pointerGesture.start.x, point.y - pointerGesture.start.y) > 7) pointerGesture.moved = true;
    if (pointerGesture.moved) {
      transform.x += dx;
      transform.y += dy;
      clampTransform();
      queueDraw();
    }
    pointerGesture.last = point;
  }
}

function pointerEnd(event) {
  const point = pointers.get(event.pointerId) ?? canvasPoint(event);
  const wasTap = pointers.size === 1 && pointerGesture?.type === 'single' && !pointerGesture.moved;
  pointers.delete(event.pointerId);
  if (wasTap) {
    const stateId = stateAtPoint(point);
    if (stateId !== null) selectState(stateId);
  }
  if (pointers.size === 1) {
    const remaining = [...pointers.values()][0];
    pointerGesture = { type: 'single', start: remaining, last: remaining, moved: false, startTransform: { ...transform } };
  } else if (pointers.size === 0) {
    pointerGesture = null;
  }
}

function renderState() {
  const selected = getSelected();
  if (!selected) {
    stateName.textContent = 'Нет живых держав';
    stateSwatch.style.background = '#847b69';
    [areaValue, armyValue, stabilityValue, influenceValue].forEach((el) => { el.textContent = '—'; });
    return;
  }
  stateName.textContent = selected.name;
  stateSwatch.style.background = selected.color;
  areaValue.textContent = selected.area;
  armyValue.textContent = Math.round(selected.military);
  stabilityValue.textContent = `${Math.round(selected.stability)}%`;
  influenceValue.textContent = selected.influence;
}

function renderInterventions() {
  const selected = getSelected();
  const disabled = world.interventionUsed || !selected;
  document.querySelectorAll('.intervention').forEach((button) => {
    button.disabled = disabled;
    const type = button.dataset.action;
    button.title = INTERVENTIONS[type]?.short ?? '';
  });
  sealStatus.textContent = world.interventionUsed ? 'ИСПОЛЬЗОВАНО' : 'ГОТОВО';
  sealStatus.classList.toggle('used', world.interventionUsed);
}

function renderTimeline() {
  const previousScroll = timelineTrack.scrollLeft;
  timelineTrack.replaceChildren();
  world.snapshots.forEach((snapshot, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'timeline-dot';
    if (index === world.snapshots.length - 1) button.classList.add('current');
    button.textContent = String(snapshot.year).slice(-2).padStart(2, '0');
    button.setAttribute('aria-label', `Вернуться к ${snapshot.year} году`);
    button.disabled = index === world.snapshots.length - 1;
    button.addEventListener('click', () => {
      if (!rewindWorld(world, index)) return;
      setFeedback(`Будущее после ${world.year} года стёрто. Следующий ход создаст ветвь №${world.branchCount + 2}.`);
      pulseStateIds = [];
      animationUntil = performance.now() + 280;
      haptic([12, 35, 12]);
      tone(110, 0.13, 0.028, 'triangle');
      persist();
      render();
    });
    timelineTrack.append(button);
  });
  timelineTrack.scrollLeft = Math.max(previousScroll, timelineTrack.scrollWidth);
}

function renderChronicle() {
  chronicleList.replaceChildren();
  const entries = world.chronicle.slice(-4).reverse();
  for (const entry of entries) {
    const item = document.createElement('li');
    const time = document.createElement('time');
    const text = document.createElement('span');
    time.textContent = entry.year;
    text.textContent = entry.text;
    item.append(time, text);
    chronicleList.append(item);
  }
}

function renderLaws() {
  for (const key of Object.keys(lawInputs)) {
    const value = Math.round(world.laws[key] * 100);
    lawInputs[key].value = value;
    lawOutputs[key].textContent = `${value}%`;
  }
  soundToggle.checked = soundEnabled;
}

function renderMilestone() {
  if (!world.milestone) {
    milestoneModal.hidden = true;
    return;
  }
  const leaders = getWorldLeaders(world);
  eraSummary.innerHTML = '';
  const items = [
    ['Живых держав', String(leaders.alive)],
    ['Главная сила', leaders.influence?.name ?? '—'],
    ['Самая устойчивая', leaders.stability?.name ?? '—'],
    ['Сильнейшая армия', leaders.military?.name ?? '—']
  ];
  for (const [label, value] of items) {
    const div = document.createElement('div');
    const span = document.createElement('span');
    const strong = document.createElement('strong');
    span.textContent = label;
    strong.textContent = value;
    div.append(span, strong);
    eraSummary.append(div);
  }
  milestoneModal.hidden = false;
}

function render() {
  yearValue.textContent = world.year;
  branchValue.textContent = world.branchCount + 1;
  advanceYear.textContent = `→ ${world.year + 10}`;
  advanceButton.classList.toggle('is-branch', world.pendingBranch);
  advanceButton.querySelector('span').textContent = world.pendingBranch ? 'ОТКРЫТЬ НОВУЮ ВЕТВЬ' : 'ПРОПУСТИТЬ ДЕСЯТИЛЕТИЕ';
  renderState();
  renderInterventions();
  renderTimeline();
  renderChronicle();
  renderLaws();
  renderMilestone();
  queueDraw();
}

function runIntervention(type) {
  const result = applyIntervention(world, type, world.selectedStateId);
  if (!result.ok) {
    setFeedback(result.reason, true);
    haptic(28);
    tone(80, 0.14, 0.02, 'sawtooth');
    return;
  }
  const selected = getSelected();
  setFeedback(`${INTERVENTIONS[type].label}: печать поставлена на ${selected?.name ?? 'державе'}.`);
  pulseStateIds = [world.selectedStateId];
  animationUntil = performance.now() + 680;
  playSeal();
  haptic([18, 20, 9]);
  persist();
  render();
}

function advance() {
  const before = world.chronicle.length;
  stepWorld(world);
  const fresh = world.chronicle.slice(before);
  pulseStateIds = [...new Set(fresh.flatMap((event) => event.stateIds))].slice(0, 4);
  animationUntil = performance.now() + 880;
  const newest = fresh.at(-1);
  setFeedback(newest?.text ?? 'Десятилетие завершено.');
  playTurn();
  haptic(12);
  persist();
  render();
}

function zoomAt(factor) {
  const center = { x: canvasSize.width / 2, y: canvasSize.height / 2 };
  const worldCenter = worldPoint(center);
  transform.scale = Math.max(0.5, Math.min(3.2, transform.scale * factor));
  transform.x = center.x - worldCenter.x * transform.scale;
  transform.y = center.y - worldCenter.y * transform.scale;
  clampTransform();
  queueDraw();
}

for (const button of document.querySelectorAll('.intervention')) {
  button.addEventListener('click', () => runIntervention(button.dataset.action));
}
advanceButton.addEventListener('click', advance);
document.querySelector('#resetViewButton').addEventListener('click', fitMap);
document.querySelector('#zoomInButton').addEventListener('click', () => zoomAt(1.22));
document.querySelector('#zoomOutButton').addEventListener('click', () => zoomAt(0.82));

document.querySelector('#settingsButton').addEventListener('click', () => {
  settingsSheet.hidden = false;
  haptic(7);
});
for (const close of document.querySelectorAll('[data-sheet-close]')) {
  close.addEventListener('click', () => { settingsSheet.hidden = true; });
}

for (const [key, input] of Object.entries(lawInputs)) {
  input.addEventListener('input', () => {
    world.laws[key] = Number(input.value) / 100;
    lawOutputs[key].textContent = `${input.value}%`;
    persist();
  });
}

soundToggle.addEventListener('change', () => {
  soundEnabled = soundToggle.checked;
  store.set('sound', soundEnabled);
  if (soundEnabled) tone(260, 0.07, 0.018, 'triangle');
});

document.querySelector('#newWorldButton').addEventListener('click', () => { confirmModal.hidden = false; });
document.querySelector('#cancelNewWorld').addEventListener('click', () => { confirmModal.hidden = true; });
document.querySelector('#confirmNewWorld').addEventListener('click', () => {
  world = createWorld();
  transform = { scale: 1, x: 0, y: 0 };
  confirmModal.hidden = true;
  setFeedback('Новая карта создана. Выберите державу и вмешайтесь.');
  playSeal();
  persist();
  render();
  requestAnimationFrame(fitMap);
});

document.querySelector('#continueEra').addEventListener('click', () => {
  world.milestone = false;
  world.eraStartTurn = world.turn;
  milestoneModal.hidden = true;
  persist();
  render();
});

mapFrame.addEventListener('pointerdown', pointerDown);
mapFrame.addEventListener('pointermove', pointerMove);
mapFrame.addEventListener('pointerup', pointerEnd);
mapFrame.addEventListener('pointercancel', pointerEnd);
mapFrame.addEventListener('lostpointercapture', pointerEnd);

const resizeObserver = new ResizeObserver(resizeCanvas);
resizeObserver.observe(mapFrame);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 80));

createWorkshopMode({
  appName: 'ПАЛИМПСЕСТ',
  version: '1.0.0',
  cachePrefix: 'palimpsest-',
  storageNamespace: 'pocket-works:palimpsest',
  onReset() {
    store.reset();
    world = createWorld();
    soundEnabled = true;
    transform = { scale: 1, x: 0, y: 0 };
    render();
    requestAnimationFrame(fitMap);
  }
});

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) persist();
});
window.addEventListener('pagehide', persist);

gestureHint.classList.toggle('is-hidden', store.get('hintSeen', false));
render();
requestAnimationFrame(resizeCanvas);
