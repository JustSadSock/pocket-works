import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { renderScene } from './painter.js';
import { itemBounds, svgFor } from './subjects.js';
import { FORMATS, BACKGROUNDS, FRAMES, ORNAMENTS, FIGURES, OBJECTS, HEADWEAR, HELD, PALETTES, STORIES, defaultState, figure, objectItem, normalizeState, clamp } from './model.js';
import { createControls } from './controls.js';

installMobileRuntime();

const STORAGE_KEY = 'pocket-works:scriptorium:state';
const MAX_HISTORY = 36;

const canvas = document.getElementById('sceneCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
const canvasWrap = document.getElementById('canvasWrap');
const selectionKind = document.getElementById('selectionKind');
const selectionName = document.getElementById('selectionName');
const selectionActions = document.getElementById('selectionActions');
const saveStatus = document.getElementById('saveStatus');
const toast = document.getElementById('toast');

let state = loadState();
let selectedId = null;
let history = [];
let future = [];
let drag = null;
let saveTimer = null;
let toastTimer = null;
let colorEditSnapshot = null;
let lineEditSnapshot = null;

function loadState() {
  try { return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
  catch { return defaultState(); }
}

function cloneState(value = state) {
  return JSON.parse(JSON.stringify(value));
}

function saveSoon() {
  saveStatus.textContent = 'сохраняю…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      saveStatus.textContent = 'сохранено';
    } catch {
      saveStatus.textContent = 'не сохранено';
    }
  }, 160);
}

function checkpoint(snapshot = cloneState()) {
  history.push(snapshot);
  if (history.length > MAX_HISTORY) history.shift();
  future.length = 0;
  updateHistoryButtons();
}

function mutate(fn) {
  checkpoint();
  fn();
  render();
  syncControls();
  saveSoon();
}

function undo() {
  if (!history.length) return;
  future.push(cloneState());
  state = normalizeState(history.pop());
  selectedId = null;
  render();
  syncControls();
  saveSoon();
  updateHistoryButtons();
}

function redo() {
  if (!future.length) return;
  history.push(cloneState());
  state = normalizeState(future.pop());
  selectedId = null;
  render();
  syncControls();
  saveSoon();
  updateHistoryButtons();
}

function updateHistoryButtons() {
  document.getElementById('undoBtn').disabled = history.length === 0;
  document.getElementById('redoBtn').disabled = future.length === 0;
}

function selectedItem() {
  return state.items.find((item) => item.id === selectedId) || null;
}

function setSelected(id) {
  selectedId = id;
  render();
  syncSelectionUi();
}

function syncSelectionUi() {
  const item = selectedItem();
  const figureEditor = document.getElementById('figureEditor');
  if (!item) {
    selectionKind.textContent = 'Сцена';
    selectionName.textContent = 'Ничего не выбрано';
    selectionActions.hidden = true;
    figureEditor.hidden = true;
    return;
  }
  selectionKind.textContent = item.type === 'figure' ? 'Персонаж' : 'Объект';
  selectionName.textContent = item.type === 'figure' ? FIGURES[item.kind].label : OBJECTS[item.kind];
  selectionActions.hidden = false;
  if (item.type === 'figure') {
    figureEditor.hidden = false;
    document.getElementById('headwearSelect').value = item.headwear;
    document.getElementById('heldSelect').value = item.held;
    document.getElementById('figureColor').value = item.color;
  } else {
    figureEditor.hidden = true;
  }
}

function palette() { return PALETTES[state.palette] || PALETTES.york; }
function render(includeSelection = true) {
  renderScene({ canvas, ctx, state, selectedId, includeSelection, FORMATS, BACKGROUNDS, FRAMES, PALETTES });
}

const { buildControls, syncControls } = createControls({
  getState: () => state,
  mutate,
  addFigure,
  addObject,
  applyPalette,
  useStory,
  clearSelection: () => { selectedId = null; },
  syncSelectionUi,
  updateHistoryButtons,
  svgFor,
  FORMATS,
  BACKGROUNDS,
  FRAMES,
  ORNAMENTS,
  FIGURES,
  OBJECTS,
  HEADWEAR,
  HELD,
  PALETTES,
  STORIES
});

function addFigure(kind) {
  const count = state.items.filter((item) => item.type === 'figure').length;
  if (count >= 3) { showToast('На одном листе — максимум три фигуры'); return; }
  mutate(() => {
    const x = [.35, .62, .5][count] || .5;
    const next = figure(kind, x, .58, count === 2 ? .82 : .92);
    state.items.push(next); selectedId = next.id;
  });
  setActiveTab('figures');
  showToast(`${FIGURES[kind].label} добавлен`);
}

function addObject(kind) {
  mutate(() => {
    const jitter = (state.items.length % 5) * .035;
    const next = objectItem(kind, clamp(.55 + jitter, .2, .82), clamp(.55 - jitter / 2, .2, .82), defaultObjectScale(kind));
    state.items.push(next); selectedId = next.id;
  });
  showToast(`${OBJECTS[kind]} добавлен`);
}

function defaultObjectScale(kind) {
  if (['tower','tree'].includes(kind)) return .78;
  if (kind === 'beast') return .84;
  if (['sun','moon','crown'].includes(kind)) return .52;
  return .68;
}

function applyPalette(key) {
  if (!PALETTES[key]) return;
  mutate(() => {
    state.palette = key;
    const p = PALETTES[key];
    let fi = 0; let oi = 0;
    for (const item of state.items) {
      if (item.type === 'figure') { item.color = p.colors[fi % p.colors.length]; fi += 1; }
      else if (item.color) { item.color = p.colors[(oi + 2) % p.colors.length]; oi += 1; }
    }
  });
  showToast(`Палитра: ${PALETTES[key].label}`);
}

function randomizeScene() {
  const figureKinds = Object.keys(FIGURES);
  const objectKinds = Object.keys(OBJECTS);
  const backgrounds = Object.keys(BACKGROUNDS);
  const frames = Object.keys(FRAMES).filter((v) => v !== 'none');
  const ornaments = Object.keys(ORNAMENTS);
  const palettes = Object.keys(PALETTES);
  checkpoint();
  const fCount = Math.random() < .72 ? 1 : 2;
  const oCount = 2 + Math.floor(Math.random() * 3);
  const items = [];
  for (let i = 0; i < fCount; i += 1) {
    const kind = pick(figureKinds);
    items.push(figure(kind, fCount === 1 ? .42 : .3 + i * .36, .58, fCount === 1 ? 1 : .78 + Math.random()*.12, {
      flip: i % 2 === 1,
      held: pick(Object.keys(HELD))
    }));
  }
  for (let i = 0; i < oCount; i += 1) {
    const kind = pick(objectKinds);
    const high = ['sun','moon'].includes(kind);
    items.push(objectItem(kind, .18 + Math.random() * .66, high ? .18 + Math.random()*.13 : .45 + Math.random()*.3, defaultObjectScale(kind) * (.82 + Math.random()*.35), { flip: Math.random()>.5 }));
  }
  state.items = items;
  state.background = pick(backgrounds);
  state.frame = pick(frames);
  state.ornament = pick(ornaments);
  state.palette = pick(palettes);
  state.inscription = Math.random() < .52 ? pick(['FORTVNA FAVET', 'MEMENTO', 'VERITAS', 'NON TIMEAS', 'LUX MUNDI', 'SIC TRANSIT']) : '';
  state.inscriptionPosition = Math.random() > .5 ? 'top' : 'bottom';
  state.items.forEach((item, index) => { if (item.type === 'figure') item.color = palette().colors[index % 4]; });
  selectedId = null;
  render(); syncControls(); saveSoon(); updateHistoryButtons();
  showToast('Новый лист собран');
  if (navigator.vibrate) navigator.vibrate(20);
}

function pick(values) { return values[Math.floor(Math.random() * values.length)]; }

function useStory(index) {
  const story = STORIES[index];
  if (!story) return;
  checkpoint();
  const keepFormat = state.format;
  state = story.scene();
  state.format = keepFormat;
  selectedId = null;
  closeStorySheet();
  render(); syncControls(); saveSoon();
  showToast(story.title);
}

function openStorySheet() {
  document.getElementById('storySheet').hidden = false;
  document.getElementById('sheetBackdrop').hidden = false;
}

function closeStorySheet() {
  document.getElementById('storySheet').hidden = true;
  document.getElementById('sheetBackdrop').hidden = true;
}

function setActiveTab(name) {
  document.querySelectorAll('.tool-tab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.tab === name));
  document.querySelectorAll('.tool-panel').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.panel === name));
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width * canvas.width,
    y: (event.clientY - rect.top) / rect.height * canvas.height
  };
}

function hitTest(point) {
  for (let i = state.items.length - 1; i >= 0; i -= 1) {
    const item = state.items[i];
    const b = itemBounds(item);
    const cx = item.x * canvas.width;
    const cy = item.y * canvas.height;
    const bw = b.w * item.scale;
    const bh = b.h * item.scale;
    const bx = cx + b.x * item.scale;
    const by = cy + b.y * item.scale;
    if (point.x >= bx && point.x <= bx + bw && point.y >= by && point.y <= by + bh) return item;
  }
  return null;
}

function onPointerDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
  const point = canvasPoint(event);
  const item = hitTest(point);
  if (!item) { setSelected(null); return; }
  setSelected(item.id);
  drag = {
    pointerId: event.pointerId,
    id: item.id,
    offsetX: point.x - item.x * canvas.width,
    offsetY: point.y - item.y * canvas.height,
    moved: false,
    snapshot: cloneState()
  };
  canvas.setPointerCapture?.(event.pointerId);
  canvasWrap.classList.add('is-dragging');
}

function onPointerMove(event) {
  if (!drag || drag.pointerId !== event.pointerId) return;
  const item = state.items.find((entry) => entry.id === drag.id);
  if (!item) return;
  const point = canvasPoint(event);
  const nx = clamp((point.x - drag.offsetX) / canvas.width, .04, .96);
  const ny = clamp((point.y - drag.offsetY) / canvas.height, .04, .96);
  if (Math.abs(nx - item.x) > .002 || Math.abs(ny - item.y) > .002) drag.moved = true;
  item.x = nx; item.y = ny;
  render();
}

function finishDrag(event) {
  if (!drag || (event && drag.pointerId !== event.pointerId)) return;
  if (drag.moved && drag.snapshot) {
    history.push(drag.snapshot);
    if (history.length > MAX_HISTORY) history.shift();
    future.length = 0;
    saveSoon();
  }
  if (event) canvas.releasePointerCapture?.(event.pointerId);
  drag = null;
  canvasWrap.classList.remove('is-dragging');
  updateHistoryButtons();
}

function selectionAction(action) {
  const item = selectedItem();
  if (!item) return;
  if (action === 'delete') {
    mutate(() => {
      state.items = state.items.filter((entry) => entry.id !== item.id);
      selectedId = null;
    });
    showToast('Удалено · можно отменить');
    return;
  }
  mutate(() => {
    if (action === 'smaller') item.scale = clamp(item.scale - .1, item.type === 'figure' ? .42 : .3, 1.7);
    if (action === 'larger') item.scale = clamp(item.scale + .1, .3, item.type === 'figure' ? 1.5 : 1.7);
    if (action === 'flip') item.flip = !item.flip;
  });
}

async function exportPng() {
  const previous = selectedId;
  selectedId = null;
  render(false);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 1));
  selectedId = previous;
  render();
  if (!blob) { showToast('Не удалось собрать PNG'); return; }
  const file = new File([blob], `scriptorium-${Date.now()}.png`, { type: 'image/png' });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Скрипторий' });
      showToast('PNG готов');
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = file.name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  showToast('PNG сохранён');
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 1700);
}

function bindEvents() {
  document.querySelectorAll('.tool-tab').forEach((tab) => tab.addEventListener('click', () => setActiveTab(tab.dataset.tab)));
  document.getElementById('undoBtn').addEventListener('click', undo);
  document.getElementById('redoBtn').addEventListener('click', redo);
  document.getElementById('randomBtn').addEventListener('click', randomizeScene);
  document.getElementById('presetBtn').addEventListener('click', openStorySheet);
  document.getElementById('exportBtn').addEventListener('click', exportPng);
  document.getElementById('closeStoryBtn').addEventListener('click', closeStorySheet);
  document.getElementById('sheetBackdrop').addEventListener('click', closeStorySheet);

  selectionActions.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (button) selectionAction(button.dataset.action);
  });

  document.getElementById('headwearSelect').addEventListener('change', (event) => {
    const item = selectedItem(); if (!item || item.type !== 'figure') return;
    mutate(() => { item.headwear = event.target.value; });
  });
  document.getElementById('heldSelect').addEventListener('change', (event) => {
    const item = selectedItem(); if (!item || item.type !== 'figure') return;
    mutate(() => { item.held = event.target.value; });
  });

  const colorInput = document.getElementById('figureColor');
  const rememberColor = () => { colorEditSnapshot = cloneState(); };
  colorInput.addEventListener('pointerdown', rememberColor);
  colorInput.addEventListener('focus', () => { if (!colorEditSnapshot) rememberColor(); });
  colorInput.addEventListener('input', (event) => {
    const item = selectedItem(); if (!item || item.type !== 'figure') return;
    item.color = event.target.value; render(); saveSoon();
  });
  colorInput.addEventListener('change', () => {
    if (colorEditSnapshot) { checkpoint(colorEditSnapshot); colorEditSnapshot = null; }
  });

  const inscription = document.getElementById('inscriptionInput');
  let inscriptionSnapshot = null;
  inscription.addEventListener('focus', () => { inscriptionSnapshot = cloneState(); });
  inscription.addEventListener('input', (event) => { state.inscription = event.target.value.slice(0,42); render(); saveSoon(); });
  inscription.addEventListener('change', () => {
    if (inscriptionSnapshot && inscriptionSnapshot.inscription !== state.inscription) checkpoint(inscriptionSnapshot);
    inscriptionSnapshot = null;
  });

  const lineWeight = document.getElementById('lineWeight');
  lineWeight.addEventListener('pointerdown', () => { lineEditSnapshot = cloneState(); });
  lineWeight.addEventListener('input', (event) => {
    state.lineWeight = Number(event.target.value);
    document.getElementById('lineWeightOutput').value = String(state.lineWeight);
    render(); saveSoon();
  });
  lineWeight.addEventListener('change', () => {
    if (lineEditSnapshot) { checkpoint(lineEditSnapshot); lineEditSnapshot = null; }
  });
  document.getElementById('textureToggle').addEventListener('change', (event) => mutate(() => { state.texture = event.target.checked; }));

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', finishDrag);
  canvas.addEventListener('pointercancel', finishDrag);
  canvas.addEventListener('lostpointercapture', () => finishDrag());
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  window.addEventListener('pagehide', () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
    }
  });
}

buildControls();
bindEvents();
render();
syncControls();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}), { once: true });
}
