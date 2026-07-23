import {
  capturePointer,
  installMobileRuntime,
  releasePointer
} from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  PAPER_COLORS,
  TOOL_DEFS,
  brushSizeInDocument,
  clamp,
  colorVariants,
  createDrawingLayer,
  createDrawingDocument,
  distance,
  drawStrokeRange,
  drawingActionCount,
  drawingContentBounds,
  drawingCountLabel,
  drawingLayers,
  fitDrawingScale,
  floodFillContext,
  isValidDrawing,
  makeId,
  normalizeDrawingDocument,
  normalizeHexColor,
  recognizeShape,
  replayDrawingRegion,
  replayDrawingScaled,
  replayStrokes,
  safeFileStem,
  selectStrokeIds,
  selectionBounds,
  simplifyPoints,
  transformStroke,
  usedDrawingColors
} from './drawing-core.js';
import { openDrawingDatabase } from './drawing-db.js';
import { encodeTimelapseGif, makeTimelapsePlan } from './timelapse.js';

const APP_NAME = 'МАЗОК';
const APP_VERSION = '2.0.0';
const STORAGE_NAMESPACE = 'pocket-works:mazok';
const THUMBNAIL_RENDER_VERSION = 4;
const FILL_TOLERANCE = 18;
const FILL_EDGE_TOLERANCE = 148;
const MAX_LAYERS = 5;
const VERSION_LIMIT = 10;
const VERSION_ACTION_INTERVAL = 12;
const VERSION_TIME_INTERVAL = 90_000;
const PIPETTE_HOLD_MS = 430;
const SHAPE_HOLD_MS = 520;
const COLOR_PALETTE = [
  '#20211f', '#f7f1e5', '#2455d6', '#ef5b49', '#f2bd3f',
  '#16856f', '#7d4ad8', '#e65e99', '#824c34', '#7c8794',
  '#0c6ea8', '#83ad3e', '#e07d2f', '#6f1f2f', '#c7bcb0'
];
const DEFAULT_RECENTS = ['#20211f', '#2455d6', '#ef5b49', '#f2bd3f'];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const elements = {
  app: $('#app'),
  editor: $('#editorScreen'),
  gallery: $('#galleryScreen'),
  canvas: $('#drawingCanvas'),
  startup: $('#startupState'),
  libraryButton: $('#libraryButton'),
  titleButton: $('#titleButton'),
  documentTitle: $('#documentTitle'),
  saveStatus: $('#saveStatus'),
  undoButton: $('#undoButton'),
  redoButton: $('#redoButton'),
  layersButton: $('#layersButton'),
  layerCount: $('#layerCount'),
  shareButton: $('#shareButton'),
  gestureHint: $('#gestureHint'),
  dismissHint: $('#dismissHint'),
  zoomReset: $('#zoomReset'),
  pipetteLoupe: $('#pipetteLoupe'),
  shapeSnap: $('#shapeSnap'),
  selectionToolbar: $('#selectionToolbar'),
  selectionCount: $('#selectionCount'),
  selectionShrink: $('#selectionShrink'),
  selectionGrow: $('#selectionGrow'),
  selectionRotate: $('#selectionRotate'),
  selectionCopy: $('#selectionCopy'),
  selectionDelete: $('#selectionDelete'),
  selectionDone: $('#selectionDone'),
  thumbPalette: $('#thumbPalette'),
  toolButton: $('#toolButton'),
  toolIcon: $('#toolIcon use'),
  toolName: $('#toolName'),
  sizeButton: $('#sizeButton'),
  sizePreview: $('#sizePreview'),
  sizeValue: $('#sizeValue'),
  quickColors: $('#quickColors'),
  colorButton: $('#colorButton'),
  colorPreview: $('#colorPreview'),
  eraserButton: $('#eraserButton'),
  focusExit: $('#focusExit'),
  galleryCount: $('#galleryCount'),
  galleryGrid: $('#galleryGrid'),
  emptyGallery: $('#emptyGallery'),
  newDrawingButton: $('#newDrawingButton'),
  emptyNewButton: $('#emptyNewButton'),
  sheetLayer: $('#sheetLayer'),
  sheetBackdrop: $('#sheetBackdrop'),
  toolSheet: $('#toolSheet'),
  toolGrid: $('#toolGrid'),
  sizeRange: $('#sizeRange'),
  sizeOutput: $('#sizeOutput'),
  largeSizePreview: $('#largeSizePreview'),
  sizeControl: $('#sizeControl'),
  colorSheet: $('#colorSheet'),
  colorGrid: $('#colorGrid'),
  usedColorsSection: $('#usedColorsSection'),
  usedColors: $('#usedColors'),
  smartColors: $('#smartColors'),
  customColor: $('#customColor'),
  paperColors: $('#paperColors'),
  actionsSheet: $('#actionsSheet'),
  actionsKicker: $('#actionsKicker'),
  actionsSheetTitle: $('#actionsSheetTitle'),
  copyAction: $('#copyAction'),
  nativeShareAction: $('#nativeShareAction'),
  downloadAction: $('#downloadAction'),
  timelapseAction: $('#timelapseAction'),
  focusAction: $('#focusAction'),
  versionsAction: $('#versionsAction'),
  renameAction: $('#renameAction'),
  duplicateAction: $('#duplicateAction'),
  clearAction: $('#clearAction'),
  newSheet: $('#newSheet'),
  createSheetMode: $('#createSheetMode'),
  createInfiniteMode: $('#createInfiniteMode'),
  layersSheet: $('#layersSheet'),
  layerList: $('#layerList'),
  layerOpacity: $('#layerOpacity'),
  layerOpacityValue: $('#layerOpacityValue'),
  layerDown: $('#layerDown'),
  layerUp: $('#layerUp'),
  layerMerge: $('#layerMerge'),
  layerDelete: $('#layerDelete'),
  addLayerButton: $('#addLayerButton'),
  versionsSheet: $('#versionsSheet'),
  versionList: $('#versionList'),
  versionsEmpty: $('#versionsEmpty'),
  timelapseSheet: $('#timelapseSheet'),
  timelapseCopy: $('#timelapseCopy'),
  timelapseProgress: $('#timelapseProgress'),
  createTimelapseButton: $('#createTimelapseButton'),
  renameSheet: $('#renameSheet'),
  titleInput: $('#titleInput'),
  saveTitleButton: $('#saveTitleButton'),
  confirmSheet: $('#confirmSheet'),
  confirmTitle: $('#confirmTitle'),
  confirmCopy: $('#confirmCopy'),
  cancelConfirm: $('#cancelConfirm'),
  acceptConfirm: $('#acceptConfirm'),
  toast: $('#toast'),
  toastText: $('#toast span'),
  fillBloom: $('#fillBloom'),
  fatal: $('#fatalState'),
  fatalCopy: $('#fatalCopy'),
  reloadButton: $('#reloadButton')
};

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);

const preferences = createVersionedStore({
  namespace: STORAGE_NAMESPACE,
  version: 1,
  defaults: {
    tool: 'ink',
    previousTool: 'ink',
    color: '#20211f',
    recentColors: DEFAULT_RECENTS,
    sizes: { pencil: 8, ink: 14, marker: 38, fill: 1, eraser: 34, select: 1 },
    paper: PAPER_COLORS[0],
    activeDrawingId: null,
    onboarded: false
  },
  validate(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }
});

let database = null;
let currentDrawing = null;
let documentCanvas = null;
let documentContext = null;
let layerSurfaces = new Map();
let viewportLayerCanvas = null;
let strokeCanvas = null;
let strokeContext = null;
let eraserBackup = null;
let currentStroke = null;
let renderedPointCount = 0;
let undoStack = [];
let redoStack = [];
let displayBox = { width: 1, height: 1, dpr: 1 };
let view = { zoom: 1, panX: 0, panY: 0, fitScale: 1 };
let renderFrame = 0;
let viewAnimationFrame = 0;
let pointers = new Map();
let pinch = null;
let suppressDrawingUntilClear = false;
let saveTimer = 0;
let saveRevision = 0;
let savedRevision = 0;
let saveQueue = Promise.resolve();
let toastTimer = 0;
let actionsTargetId = null;
let actionsTargetCache = null;
let renameTargetId = null;
let confirmCallback = null;
let galleryObjectUrls = [];
let galleryGeneration = 0;
let pendingThumbnailJobs = [];
let thumbnailWorkerRunning = false;
let openingDrawingId = null;
let persistentStorageRequested = false;
let selection = null;
let selectionGesture = null;
let holdOrigin = null;
let pipetteTimer = 0;
let shapeTimer = 0;
let gestureConsumed = false;
let actionsSinceVersion = 0;
let versionQueue = Promise.resolve();
let timelapseBusy = false;
let timelapseTarget = null;
let versionsTargetId = null;
let layerOpacityBefore = null;
const animationTimers = new WeakMap();

function restartAnimation(element, className, duration = 360) {
  if (!element) return;
  window.clearTimeout(animationTimers.get(element));
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  const timer = window.setTimeout(() => {
    element.classList.remove(className);
    animationTimers.delete(element);
  }, duration);
  animationTimers.set(element, timer);
}

function animateScreenEntry(screen, direction) {
  if (!screen) return;
  screen.dataset.entry = direction;
  restartAnimation(screen, 'is-entering', 440);
}

function animateFillBloom(clientX, clientY, color) {
  const rect = elements.canvas.getBoundingClientRect();
  elements.fillBloom.style.setProperty('--fill-x', `${clientX - rect.left}px`);
  elements.fillBloom.style.setProperty('--fill-y', `${clientY - rect.top}px`);
  elements.fillBloom.style.setProperty('--fill-color', normalizeHexColor(color));
  restartAnimation(elements.fillBloom, 'is-active', 560);
}

function cloneValue(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function currentLayers() {
  return currentDrawing?.layers || [];
}

function activeLayer() {
  if (!currentDrawing) return null;
  return currentLayers().find((layer) => layer.id === currentDrawing.activeLayerId) || currentLayers().at(-1) || null;
}

function layerSurface(layerId = currentDrawing?.activeLayerId) {
  return layerSurfaces.get(layerId) || null;
}

function cloneLayers() {
  return cloneValue(currentLayers());
}

function nextSequence() {
  const sequence = Math.max(1, Number(currentDrawing?.nextSequence) || 1);
  currentDrawing.nextSequence = sequence + 1;
  return sequence;
}

function clearHoldTimers() {
  window.clearTimeout(pipetteTimer);
  window.clearTimeout(shapeTimer);
  pipetteTimer = 0;
  shapeTimer = 0;
}

function updateLayerBadge() {
  elements.layerCount.textContent = String(currentLayers().length || 1);
  restartAnimation(elements.layersButton, 'is-layer-changing', 330);
}

function setSelection(nextSelection) {
  selection = nextSelection;
  const count = selection?.strokeIds?.length || 0;
  const lastTwo = count % 100;
  const last = count % 10;
  const suffix = last === 1 && lastTwo !== 11
    ? 'объект'
    : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
      ? 'объекта'
      : 'объектов';
  elements.selectionToolbar.hidden = count === 0;
  elements.selectionCount.textContent = `${count} ${suffix}`;
  scheduleRender();
}

function selectionLayer() {
  if (!selection) return null;
  return currentLayers().find((layer) => layer.id === selection.layerId) || null;
}

function selectedBounds() {
  const layer = selectionLayer();
  return layer ? selectionBounds(layer.strokes, selection.strokeIds) : null;
}

function animatePickedColor(clientX, clientY, color) {
  const rect = elements.canvas.getBoundingClientRect();
  elements.pipetteLoupe.style.left = `${clientX - rect.left}px`;
  elements.pipetteLoupe.style.top = `${clientY - rect.top}px`;
  elements.pipetteLoupe.style.setProperty('--picked-color', color);
  $('span', elements.pipetteLoupe).textContent = color.toUpperCase();
  restartAnimation(elements.pipetteLoupe, 'is-active', 760);
}

function animateShapeSnap(label) {
  $('span', elements.shapeSnap).textContent = `${label} · ровно`;
  restartAnimation(elements.shapeSnap, 'is-active', 1080);
}

function setSaveStatus(label, mode = 'saved') {
  elements.saveStatus.dataset.mode = mode;
  const text = elements.saveStatus.lastChild;
  if (text) text.textContent = label;
}

function showToast(message, mode = 'success') {
  window.clearTimeout(toastTimer);
  elements.toast.dataset.mode = mode;
  elements.toastText.textContent = message;
  elements.toast.classList.remove('is-visible');
  void elements.toast.offsetWidth;
  elements.toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => elements.toast.classList.remove('is-visible'), 2600);
}

function fail(error, message = 'Перезапусти приложение. Уже сохранённые рисунки останутся на месте.') {
  console.error(`${APP_NAME} failed`, error);
  elements.fatalCopy.textContent = message;
  elements.fatal.hidden = false;
  elements.startup.hidden = true;
}

function requestPersistentStorage() {
  if (persistentStorageRequested) return;
  persistentStorageRequested = true;
  navigator.storage?.persist?.().catch(() => {});
}

function selectedTool() {
  const tool = preferences.get('tool', 'ink');
  return TOOL_DEFS[tool] ? tool : 'ink';
}

function selectedColor() {
  return normalizeHexColor(preferences.get('color', '#20211f'));
}

function selectedSize(tool = selectedTool()) {
  const sizes = preferences.get('sizes', {});
  const definition = TOOL_DEFS[tool] || TOOL_DEFS.ink;
  return clamp(Number(sizes?.[tool]) || definition.defaultSize, definition.min, definition.max);
}

function setTool(tool) {
  if (!TOOL_DEFS[tool]) return;
  if (tool === 'fill' && currentDrawing?.canvasMode === 'infinite') {
    showToast('На бесконечной сетке заливка не работает', 'error');
    return;
  }
  const current = selectedTool();
  const patch = { tool };
  if (tool !== 'eraser') patch.previousTool = tool;
  else if (current !== 'eraser') patch.previousTool = current;
  preferences.patch(patch);
  if (tool !== 'select' && selection) setSelection(null);
  syncToolInterface();
  if (tool !== current) restartAnimation(elements.toolButton, 'is-tool-changing', 300);
}

function setSize(value) {
  const tool = selectedTool();
  const definition = TOOL_DEFS[tool];
  const next = clamp(Math.round(Number(value) || definition.defaultSize), definition.min, definition.max);
  const sizes = preferences.get('sizes', {});
  preferences.set('sizes', { ...sizes, [tool]: next });
  syncSizeInterface();
}

function rememberColor(color) {
  const normalized = normalizeHexColor(color, selectedColor());
  const recents = preferences.get('recentColors', DEFAULT_RECENTS)
    .filter((entry) => normalizeHexColor(entry) !== normalized);
  preferences.patch({ color: normalized, recentColors: [normalized, ...recents].slice(0, 5) });
  syncColorInterface();
  restartAnimation(elements.colorButton, 'is-color-changing', 300);
}

function syncToolInterface() {
  const tool = selectedTool();
  const definition = TOOL_DEFS[tool];
  const isFill = tool === 'fill';
  const isSelect = tool === 'select';
  elements.toolIcon.setAttribute('href', `#${definition.icon}`);
  elements.toolName.textContent = definition.label;
  elements.eraserButton.classList.toggle('is-active', tool === 'eraser');
  elements.toolButton.classList.toggle('is-eraser', tool === 'eraser');
  elements.toolButton.classList.toggle('is-fill', isFill);
  elements.toolButton.classList.toggle('is-select', isSelect);
  elements.thumbPalette.classList.toggle('is-fill', isFill);
  elements.thumbPalette.classList.toggle('is-select', isSelect);
  elements.sizeButton.hidden = isFill || isSelect;
  elements.sizeControl.hidden = isFill || isSelect;
  for (const button of $$('[data-tool]', elements.toolGrid)) {
    const active = button.dataset.tool === tool;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
    if (button.dataset.tool === 'fill') {
      button.disabled = currentDrawing?.canvasMode === 'infinite';
      button.title = button.disabled ? 'Заливка доступна только на листе' : '';
    }
  }
  syncSizeInterface();
}

function syncSizeInterface() {
  const tool = selectedTool();
  const definition = TOOL_DEFS[tool];
  const size = selectedSize(tool);
  elements.sizeRange.min = String(definition.min);
  elements.sizeRange.max = String(definition.max);
  elements.sizeRange.value = String(size);
  elements.sizeOutput.value = String(size);
  elements.sizeOutput.textContent = String(size);
  elements.sizeValue.textContent = String(size);
  const preview = clamp(5 + size * 0.35, 7, 28);
  elements.sizePreview.style.setProperty('--preview-size', `${preview}px`);
  elements.largeSizePreview.style.setProperty('--preview-size', `${clamp(8 + size * 0.55, 10, 58)}px`);
  runtime.refreshControls(elements.toolSheet);
}

function makeColorButton(color, className = '', onSelect = rememberColor) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.dataset.color = color;
  button.dataset.nativePress = '';
  button.setAttribute('aria-label', `Выбрать цвет ${color}`);
  button.style.setProperty('--swatch', color);
  button.innerHTML = '<i></i>';
  button.addEventListener('click', () => onSelect(color));
  return button;
}

function renderQuickColors() {
  elements.quickColors.replaceChildren();
  const recents = preferences.get('recentColors', DEFAULT_RECENTS);
  for (const color of recents.slice(0, 3)) {
    const normalized = normalizeHexColor(color);
    const button = makeColorButton(normalized, 'quick-color');
    const active = normalized === selectedColor();
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
    elements.quickColors.append(button);
  }
}

function renderColorGrid() {
  elements.colorGrid.replaceChildren();
  for (const color of COLOR_PALETTE) elements.colorGrid.append(makeColorButton(color, 'swatch-button'));
}

function renderSmartColors() {
  elements.smartColors.replaceChildren(
    ...colorVariants(selectedColor()).map((color) => makeColorButton(color, 'swatch-button'))
  );
  const used = currentDrawing ? usedDrawingColors(currentDrawing) : [];
  elements.usedColors.replaceChildren(...used.map((color) => makeColorButton(color, 'swatch-button')));
  elements.usedColorsSection.hidden = used.length === 0;
}

function renderPaperColors() {
  elements.paperColors.replaceChildren();
  for (const color of PAPER_COLORS) {
    const button = makeColorButton(color, 'paper-color', () => {
      if (!currentDrawing) return;
      currentDrawing.background = color;
      preferences.set('paper', color);
      renderPaperColors();
      rebuildDocument();
      restartAnimation(elements.canvas, 'is-paper-changing', 340);
      markDirty();
      noteDrawingAction();
    });
    const active = currentDrawing?.background === color;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
    elements.paperColors.append(button);
  }
}

function syncColorInterface() {
  const color = selectedColor();
  elements.colorPreview.style.setProperty('--active-color', color);
  elements.customColor.value = color;
  renderQuickColors();
  renderSmartColors();
  for (const button of $$('[data-color]', elements.colorGrid)) {
    const active = button.dataset.color.toLowerCase() === color;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

function updateHistoryButtons() {
  elements.undoButton.disabled = undoStack.length === 0;
  elements.redoButton.disabled = redoStack.length === 0;
}

function openSheet(sheet, focusTarget = null) {
  for (const candidate of $$('.bottom-sheet', elements.sheetLayer)) candidate.hidden = candidate !== sheet;
  elements.sheetLayer.hidden = false;
  requestAnimationFrame(() => {
    elements.sheetLayer.classList.add('is-open');
    sheet.classList.add('is-open');
    focusTarget?.focus?.({ preventScroll: true });
  });
}

function closeSheet() {
  if (elements.sheetLayer.hidden) return;
  elements.sheetLayer.classList.remove('is-open');
  for (const candidate of $$('.bottom-sheet', elements.sheetLayer)) candidate.classList.remove('is-open');
  window.setTimeout(() => {
    if (!elements.sheetLayer.classList.contains('is-open')) {
      elements.sheetLayer.hidden = true;
      for (const candidate of $$('.bottom-sheet', elements.sheetLayer)) candidate.hidden = true;
    }
  }, 230);
  elements.titleInput.blur();
}

function openToolSheet() {
  syncToolInterface();
  openSheet(elements.toolSheet);
}

function openColorSheet() {
  syncColorInterface();
  renderPaperColors();
  openSheet(elements.colorSheet);
}

async function openRenameSheet(id = currentDrawing?.id) {
  renameTargetId = id;
  const drawing = id === currentDrawing?.id ? currentDrawing : await database.get(id);
  if (!drawing) throw new Error('Drawing not found');
  const title = drawing.title || 'Без названия';
  elements.titleInput.value = title === 'Без названия' ? '' : title;
  openSheet(elements.renameSheet, elements.titleInput);
  elements.titleInput.select();
}

function openConfirm(options) {
  confirmCallback = options.onAccept;
  elements.confirmTitle.textContent = options.title;
  elements.confirmCopy.textContent = options.copy;
  elements.acceptConfirm.textContent = options.acceptLabel || 'Удалить';
  openSheet(elements.confirmSheet, elements.cancelConfirm);
}

function currentDocumentScale() {
  return Math.max(0.001, view.fitScale * view.zoom);
}

function releaseCanvas(canvas) {
  if (!canvas) return;
  canvas.width = 1;
  canvas.height = 1;
}

function releaseLayerSurfaces() {
  for (const surface of layerSurfaces.values()) releaseCanvas(surface.canvas);
  layerSurfaces = new Map();
}

function makeDocumentSurface() {
  const canvas = document.createElement('canvas');
  canvas.width = currentDrawing.width;
  canvas.height = currentDrawing.height;
  const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!context) throw new Error('Could not create a layer surface');
  context.imageSmoothingEnabled = true;
  return { canvas, context };
}

function rebuildComposite() {
  if (!documentContext || !documentCanvas || currentDrawing?.canvasMode === 'infinite') return;
  documentContext.setTransform(1, 0, 0, 1, 0, 0);
  documentContext.clearRect(0, 0, documentCanvas.width, documentCanvas.height);
  for (const layer of currentLayers()) {
    if (!layer.visible || layer.opacity <= 0) continue;
    const surface = layerSurface(layer.id);
    if (!surface) continue;
    documentContext.save();
    documentContext.globalAlpha = clamp(Number(layer.opacity), 0, 1);
    documentContext.drawImage(surface.canvas, 0, 0);
    documentContext.restore();
  }
}

function rebuildLayerSurface(layerId) {
  if (currentDrawing?.canvasMode === 'infinite') {
    scheduleRender();
    return;
  }
  const layer = currentLayers().find((candidate) => candidate.id === layerId);
  const surface = layerSurface(layerId);
  if (!layer || !surface) return;
  replayStrokes(surface.context, layer.strokes, currentDrawing.width, currentDrawing.height, currentDrawing.background);
  rebuildComposite();
}

function ensureDocumentSurfaces() {
  if (!currentDrawing) return;
  releaseCanvas(documentCanvas);
  releaseCanvas(strokeCanvas);
  releaseCanvas(eraserBackup);
  releaseLayerSurfaces();
  documentCanvas = null;
  documentContext = null;
  strokeCanvas = null;
  strokeContext = null;
  eraserBackup = null;

  if (currentDrawing.canvasMode === 'infinite') {
    viewportLayerCanvas ||= document.createElement('canvas');
    scheduleRender();
    return;
  }

  documentCanvas = document.createElement('canvas');
  documentCanvas.width = currentDrawing.width;
  documentCanvas.height = currentDrawing.height;
  documentContext = documentCanvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!documentContext) throw new Error('Could not create the drawing surface');
  documentContext.imageSmoothingEnabled = true;

  strokeCanvas = document.createElement('canvas');
  strokeCanvas.width = currentDrawing.width;
  strokeCanvas.height = currentDrawing.height;
  strokeContext = strokeCanvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!strokeContext) throw new Error('Could not create the stroke surface');
  for (const layer of currentLayers()) {
    const surface = makeDocumentSurface();
    replayStrokes(surface.context, layer.strokes, currentDrawing.width, currentDrawing.height, currentDrawing.background);
    layerSurfaces.set(layer.id, surface);
  }
  rebuildComposite();
}

function resizeDisplayCanvas() {
  const rect = elements.canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (elements.canvas.width !== width || elements.canvas.height !== height) {
    elements.canvas.width = width;
    elements.canvas.height = height;
  }
  displayBox = { width: rect.width, height: rect.height, dpr };
  if (currentDrawing) {
    view.fitScale = currentDrawing.canvasMode === 'infinite'
      ? rect.width / currentDrawing.width
      : fitDrawingScale(rect.width, rect.height, currentDrawing.width, currentDrawing.height);
    clampView();
  }
  scheduleRender();
}

function clampView() {
  if (!currentDrawing) return;
  view.zoom = clamp(view.zoom, currentDrawing.canvasMode === 'infinite' ? 0.35 : 1, currentDrawing.canvasMode === 'infinite' ? 8 : 6);
  const scale = currentDocumentScale();
  if (currentDrawing.canvasMode === 'infinite') {
    const reach = 900_000 * scale;
    view.panX = clamp(view.panX, -reach, reach);
    view.panY = clamp(view.panY, -reach, reach);
    return;
  }
  const renderedWidth = currentDrawing.width * scale;
  const renderedHeight = currentDrawing.height * scale;
  const maxX = Math.max(0, (renderedWidth - displayBox.width) * 0.5 + 28);
  const maxY = Math.max(0, (renderedHeight - displayBox.height) * 0.5 + 28);
  view.panX = clamp(view.panX, -maxX, maxX);
  view.panY = clamp(view.panY, -maxY, maxY);
}

function screenToDocument(clientX, clientY) {
  const rect = elements.canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const scale = currentDocumentScale();
  return {
    x: (x - displayBox.width * 0.5 - view.panX) / scale + currentDrawing.width * 0.5,
    y: (y - displayBox.height * 0.5 - view.panY) / scale + currentDrawing.height * 0.5
  };
}

function pointInsideDocument(point, margin = 0) {
  if (currentDrawing.canvasMode === 'infinite') {
    return Math.abs(point.x) <= 1_000_000 - margin && Math.abs(point.y) <= 1_000_000 - margin;
  }
  return point.x >= -margin && point.y >= -margin
    && point.x <= currentDrawing.width + margin
    && point.y <= currentDrawing.height + margin;
}

function scheduleRender() {
  if (renderFrame) return;
  renderFrame = requestAnimationFrame(renderDisplay);
}

function drawInfiniteGrid(context, width, height, originX, originY, scale) {
  context.save();
  let spacing = 80 * scale;
  while (spacing < 18) spacing *= 2;
  while (spacing > 78) spacing *= 0.5;
  const startX = ((originX % spacing) + spacing) % spacing;
  const startY = ((originY % spacing) + spacing) % spacing;
  context.fillStyle = 'rgba(42, 63, 92, .2)';
  for (let x = startX; x <= width; x += spacing) {
    for (let y = startY; y <= height; y += spacing) {
      context.beginPath();
      context.arc(x, y, spacing > 34 ? 1.15 : 0.8, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

function renderInfiniteLayers(context, originX, originY, scale) {
  viewportLayerCanvas ||= document.createElement('canvas');
  if (viewportLayerCanvas.width !== elements.canvas.width || viewportLayerCanvas.height !== elements.canvas.height) {
    viewportLayerCanvas.width = elements.canvas.width;
    viewportLayerCanvas.height = elements.canvas.height;
  }
  const layerContext = viewportLayerCanvas.getContext('2d', { alpha: true, desynchronized: true });
  for (const layer of currentLayers()) {
    if (!layer.visible || layer.opacity <= 0) continue;
    layerContext.setTransform(1, 0, 0, 1, 0, 0);
    layerContext.clearRect(0, 0, viewportLayerCanvas.width, viewportLayerCanvas.height);
    layerContext.save();
    layerContext.setTransform(
      displayBox.dpr * scale,
      0,
      0,
      displayBox.dpr * scale,
      displayBox.dpr * originX,
      displayBox.dpr * originY
    );
    for (const stroke of layer.strokes) drawStrokeRange(layerContext, stroke, 0);
    if (currentStroke && layer.id === currentDrawing.activeLayerId && currentStroke.tool !== 'fill') {
      drawStrokeRange(layerContext, currentStroke, 0);
    }
    layerContext.restore();
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = layer.opacity;
    context.drawImage(viewportLayerCanvas, 0, 0);
    context.restore();
  }
}

function drawSelectionOverlay(context, originX, originY, scale) {
  const lassoPoints = selectionGesture?.type === 'lasso' ? selectionGesture.points : null;
  const bounds = selectedBounds();
  if (!lassoPoints?.length && !bounds) return;
  context.save();
  context.translate(originX, originY);
  context.scale(scale, scale);
  context.lineWidth = 2 / scale;
  context.strokeStyle = '#2455d6';
  context.fillStyle = '#fffaf0';
  context.setLineDash([8 / scale, 6 / scale]);
  context.lineDashOffset = -(performance.now() / 55) % (14 / scale);
  if (lassoPoints?.length) {
    context.beginPath();
    context.moveTo(lassoPoints[0].x, lassoPoints[0].y);
    for (const point of lassoPoints.slice(1)) context.lineTo(point.x, point.y);
    context.stroke();
    scheduleRender();
  }
  if (bounds) {
    context.strokeRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
    context.setLineDash([]);
    const radius = 5 / scale;
    for (const point of [
      [bounds.minX, bounds.minY],
      [bounds.maxX, bounds.minY],
      [bounds.maxX, bounds.maxY],
      [bounds.minX, bounds.maxY]
    ]) {
      context.beginPath();
      context.arc(point[0], point[1], radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
  }
  context.restore();
}

function renderDisplay() {
  renderFrame = 0;
  const context = elements.canvas.getContext('2d', { alpha: false, desynchronized: true });
  const { width, height, dpr } = displayBox;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#d8d0c3';
  context.fillRect(0, 0, width, height);
  if (!currentDrawing) return;

  const scale = currentDocumentScale();
  const originX = width * 0.5 + view.panX - currentDrawing.width * scale * 0.5;
  const originY = height * 0.5 + view.panY - currentDrawing.height * scale * 0.5;

  if (currentDrawing.canvasMode === 'infinite') {
    context.fillStyle = '#f1ece2';
    context.fillRect(0, 0, width, height);
    drawInfiniteGrid(context, width, height, originX, originY, scale);
    renderInfiniteLayers(context, originX, originY, scale);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSelectionOverlay(context, originX, originY, scale);
    elements.zoomReset.hidden = Math.abs(view.zoom - 1) < 0.015;
    elements.zoomReset.textContent = `${Math.round(view.zoom * 100)}%`;
    return;
  }

  if (!documentCanvas) return;
  context.save();
  context.shadowColor = 'rgba(43, 37, 28, .2)';
  context.shadowBlur = 18;
  context.shadowOffsetY = 5;
  context.fillStyle = currentDrawing.background;
  context.fillRect(originX, originY, currentDrawing.width * scale, currentDrawing.height * scale);
  context.restore();

  context.save();
  context.translate(originX, originY);
  context.scale(scale, scale);
  context.fillStyle = currentDrawing.background;
  context.fillRect(0, 0, currentDrawing.width, currentDrawing.height);
  for (const layer of currentLayers()) {
    if (!layer.visible || layer.opacity <= 0) continue;
    const surface = layerSurface(layer.id);
    if (!surface) continue;
    context.save();
    context.globalAlpha = layer.opacity;
    context.drawImage(surface.canvas, 0, 0);
    context.restore();
    if (currentStroke && layer.id === currentDrawing.activeLayerId && currentStroke.tool !== 'eraser' && currentStroke.tool !== 'fill') {
      context.save();
      context.globalAlpha = layer.opacity * TOOL_DEFS[currentStroke.tool].opacity;
      context.drawImage(strokeCanvas, 0, 0);
      context.restore();
    }
  }
  if (selectionGesture?.type === 'preview' && selectionGesture.previewStrokes?.length) {
    context.save();
    for (const stroke of selectionGesture.previewStrokes) drawStrokeRange(context, stroke, 0);
    context.restore();
  }
  context.lineWidth = 1 / scale;
  context.strokeStyle = 'rgba(50, 45, 38, .14)';
  context.strokeRect(0, 0, currentDrawing.width, currentDrawing.height);
  context.restore();
  drawSelectionOverlay(context, originX, originY, scale);

  elements.zoomReset.hidden = Math.abs(view.zoom - 1) < 0.015;
  elements.zoomReset.textContent = `${Math.round(view.zoom * 100)}%`;
}

function pointerSample(event, isFinal = false) {
  const raw = screenToDocument(event.clientX, event.clientY);
  const previous = currentStroke?.points?.at(-1);
  const blend = isFinal || event.pointerType === 'pen' ? 0.78 : 0.48;
  const smoothed = previous
    ? { x: previous.x + (raw.x - previous.x) * blend, y: previous.y + (raw.y - previous.y) * blend }
    : raw;
  const x = currentDrawing.canvasMode === 'infinite' ? smoothed.x : clamp(smoothed.x, 0, currentDrawing.width);
  const y = currentDrawing.canvasMode === 'infinite' ? smoothed.y : clamp(smoothed.y, 0, currentDrawing.height);
  return {
    x,
    y,
    p: event.pressure > 0 ? clamp(event.pressure, 0.05, 1) : 0.5,
    t: Math.max(0, Math.round(event.timeStamp || performance.now()))
  };
}

function clearStrokeSurface() {
  if (!strokeContext || !strokeCanvas) return;
  strokeContext.setTransform(1, 0, 0, 1, 0, 0);
  strokeContext.clearRect(0, 0, strokeCanvas.width, strokeCanvas.height);
}

function rgbHex(red, green, blue) {
  return `#${[red, green, blue].map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

function sampleVisibleColor(clientX, clientY) {
  try {
    if (currentDrawing.canvasMode !== 'infinite' && documentContext) {
      const point = screenToDocument(clientX, clientY);
      if (!pointInsideDocument(point)) return currentDrawing.background;
      const pixel = documentContext.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data;
      if (pixel[3] < 8) return currentDrawing.background;
      const alpha = pixel[3] / 255;
      const paper = normalizeHexColor(currentDrawing.background);
      const paperRgb = [
        Number.parseInt(paper.slice(1, 3), 16),
        Number.parseInt(paper.slice(3, 5), 16),
        Number.parseInt(paper.slice(5, 7), 16)
      ];
      return rgbHex(
        pixel[0] * alpha + paperRgb[0] * (1 - alpha),
        pixel[1] * alpha + paperRgb[1] * (1 - alpha),
        pixel[2] * alpha + paperRgb[2] * (1 - alpha)
      );
    }
    const rect = elements.canvas.getBoundingClientRect();
    const x = clamp(Math.round((clientX - rect.left) * displayBox.dpr), 0, elements.canvas.width - 1);
    const y = clamp(Math.round((clientY - rect.top) * displayBox.dpr), 0, elements.canvas.height - 1);
    const pixel = elements.canvas.getContext('2d').getImageData(x, y, 1, 1).data;
    return rgbHex(pixel[0], pixel[1], pixel[2]);
  } catch {
    return selectedColor();
  }
}

function triggerPipette() {
  if (!currentStroke || !holdOrigin || currentStroke.points.length > 1 || pointers.size !== 1) return;
  if (currentStroke.tool === 'eraser' && eraserBackup && currentDrawing.canvasMode !== 'infinite') {
    const surface = layerSurface();
    surface.context.clearRect(0, 0, currentDrawing.width, currentDrawing.height);
    surface.context.drawImage(eraserBackup, 0, 0);
    rebuildComposite();
  }
  if (currentDrawing.canvasMode === 'infinite') {
    currentStroke = null;
    renderDisplay();
  }
  const color = sampleVisibleColor(holdOrigin.clientX, holdOrigin.clientY);
  gestureConsumed = true;
  currentStroke = null;
  eraserBackup = null;
  clearStrokeSurface();
  elements.editor.classList.remove('is-drawing');
  rememberColor(color);
  animatePickedColor(holdOrigin.clientX, holdOrigin.clientY, color);
  navigator.vibrate?.(12);
  scheduleRender();
}

function redrawCurrentStrokePreview() {
  if (!currentStroke) return;
  if (currentDrawing.canvasMode === 'infinite') {
    scheduleRender();
    return;
  }
  clearStrokeSurface();
  if (currentStroke.tool !== 'eraser' && currentStroke.tool !== 'fill') {
    drawStrokeRange(strokeContext, currentStroke, 0, { opacity: 1 });
    renderedPointCount = currentStroke.points.length;
  }
  scheduleRender();
}

function scheduleShapeRecognition() {
  window.clearTimeout(shapeTimer);
  if (!currentStroke || currentStroke.snapped || !['pencil', 'ink', 'marker'].includes(currentStroke.tool) || currentStroke.points.length < 4) return;
  shapeTimer = window.setTimeout(() => {
    if (!currentStroke || pointers.size !== 1) return;
    const recognized = recognizeShape(currentStroke);
    if (!recognized) return;
    currentStroke.points = recognized.points.map((point, index) => ({
      ...point,
      t: Math.max(0, Math.round(performance.now() + index))
    }));
    currentStroke.shape = recognized.type;
    currentStroke.snapped = true;
    redrawCurrentStrokePreview();
    animateShapeSnap(recognized.label);
    navigator.vibrate?.(10);
  }, SHAPE_HOLD_MS);
}

function pushHistory(entry) {
  undoStack.push(entry);
  if (undoStack.length > 60) undoStack.shift();
  redoStack = [];
  updateHistoryButtons();
}

function beginSelectionGesture(point) {
  const bounds = selectedBounds();
  const padding = 22 / currentDocumentScale();
  if (selection && bounds
    && point.x >= bounds.minX - padding && point.x <= bounds.maxX + padding
    && point.y >= bounds.minY - padding && point.y <= bounds.maxY + padding) {
    selectionGesture = {
      type: 'move',
      start: point,
      beforeLayers: cloneLayers(),
      originalStrokes: cloneValue(selectionLayer().strokes),
      moved: false
    };
  } else {
    setSelection(null);
    selectionGesture = { type: 'lasso', points: [point] };
  }
  elements.editor.classList.add('is-drawing');
}

function updateSelectionGesture(point) {
  if (!selectionGesture) return;
  if (selectionGesture.type === 'lasso') {
    const previous = selectionGesture.points.at(-1);
    if (!previous || distance(previous, point) > 3 / currentDocumentScale()) selectionGesture.points.push(point);
    scheduleRender();
    return;
  }
  if (selectionGesture.type !== 'move' || !selection) return;
  const translateX = point.x - selectionGesture.start.x;
  const translateY = point.y - selectionGesture.start.y;
  selectionGesture.moved ||= Math.hypot(translateX, translateY) > 2 / currentDocumentScale();
  const selectedIds = new Set(selection.strokeIds);
  const layer = selectionLayer();
  layer.strokes = selectionGesture.originalStrokes.map((stroke) => selectedIds.has(stroke.id)
    ? transformStroke(stroke, { translateX, translateY })
    : cloneValue(stroke));
  rebuildLayerSurface(layer.id);
  scheduleRender();
}

function finishSelectionGesture() {
  if (!selectionGesture) return;
  const gesture = selectionGesture;
  selectionGesture = null;
  elements.editor.classList.remove('is-drawing');
  if (gesture.type === 'lasso') {
    if (gesture.points.length < 3) {
      setSelection(null);
      showToast('Обведи нужные мазки');
      return;
    }
    const layer = activeLayer();
    const ids = selectStrokeIds(layer.strokes, gesture.points);
    if (!ids.length) {
      setSelection(null);
      showToast('Внутри ничего не нашлось');
      return;
    }
    setSelection({ layerId: layer.id, strokeIds: ids });
    navigator.vibrate?.(8);
    return;
  }
  if (gesture.moved) {
    pushHistory({ kind: 'layers', before: gesture.beforeLayers, after: cloneLayers() });
    markDirty();
    noteDrawingAction();
  }
  scheduleRender();
}

function beginStroke(event) {
  if (!currentDrawing || suppressDrawingUntilClear) return;
  const documentPoint = screenToDocument(event.clientX, event.clientY);
  if (!pointInsideDocument(documentPoint)) return;
  const tool = selectedTool();
  gestureConsumed = false;
  holdOrigin = { clientX: event.clientX, clientY: event.clientY, point: documentPoint };
  if (tool === 'select') {
    beginSelectionGesture(documentPoint);
    return;
  }
  if (tool === 'fill' && currentDrawing.canvasMode === 'infinite') {
    gestureConsumed = true;
    showToast('Для простора заливка отключена', 'error');
    return;
  }
  const layer = activeLayer();
  if (!layer) return;
  if (!layer.visible) {
    layer.visible = true;
    renderLayerList();
  }
  const point = pointerSample(event);
  currentStroke = {
    id: makeId('stroke'),
    tool,
    color: selectedColor(),
    size: tool === 'fill' ? 1 : brushSizeInDocument(selectedSize(tool), currentDrawing.width),
    tolerance: tool === 'fill' ? FILL_TOLERANCE : undefined,
    edgeTolerance: tool === 'fill' ? FILL_EDGE_TOLERANCE : undefined,
    seed: Math.floor(Math.random() * 0xffffffff),
    seq: nextSequence(),
    createdAt: new Date().toISOString(),
    points: [point]
  };
  pipetteTimer = window.setTimeout(triggerPipette, PIPETTE_HOLD_MS);
  renderedPointCount = 0;
  clearStrokeSurface();
  if (currentDrawing.canvasMode !== 'infinite' && tool === 'eraser') {
    const surface = layerSurface(layer.id);
    eraserBackup = document.createElement('canvas');
    eraserBackup.width = currentDrawing.width;
    eraserBackup.height = currentDrawing.height;
    eraserBackup.getContext('2d').drawImage(surface.canvas, 0, 0);
    drawStrokeRange(surface.context, currentStroke, 0);
    rebuildComposite();
  } else if (currentDrawing.canvasMode !== 'infinite') {
    const opacity = TOOL_DEFS[tool].opacity < 1 ? 1 : TOOL_DEFS[tool].opacity;
    drawStrokeRange(strokeContext, currentStroke, 0, { opacity });
  }
  renderedPointCount = 1;
  elements.editor.classList.add('is-drawing');
  scheduleRender();
}

function appendPointerEvent(event, isFinal = false) {
  if (selectionGesture) {
    updateSelectionGesture(screenToDocument(event.clientX, event.clientY));
    return;
  }
  if (!currentStroke || gestureConsumed) return;
  const raw = screenToDocument(event.clientX, event.clientY);
  if (!pointInsideDocument(raw, currentStroke.size * 1.5)) return;
  if (holdOrigin && Math.hypot(event.clientX - holdOrigin.clientX, event.clientY - holdOrigin.clientY) > 7) {
    window.clearTimeout(pipetteTimer);
    pipetteTimer = 0;
  }
  if (currentStroke.snapped) return;
  const point = pointerSample(event, isFinal);
  if (currentStroke.tool === 'fill') {
    currentStroke.points[0] = point;
    return;
  }
  const previous = currentStroke.points.at(-1);
  if (!isFinal && distance(point, previous) < Math.max(0.35, currentStroke.size * 0.025)) return;
  currentStroke.points.push(point);
  const start = renderedPointCount;
  if (currentDrawing.canvasMode !== 'infinite' && currentStroke.tool === 'eraser') {
    drawStrokeRange(layerSurface()?.context, currentStroke, start);
    rebuildComposite();
  } else if (currentDrawing.canvasMode !== 'infinite') {
    const opacity = TOOL_DEFS[currentStroke.tool].opacity < 1 ? 1 : TOOL_DEFS[currentStroke.tool].opacity;
    drawStrokeRange(strokeContext, currentStroke, start, { opacity });
  }
  renderedPointCount = currentStroke.points.length;
  if (!isFinal) scheduleShapeRecognition();
}

function moveStroke(event) {
  const samples = event.getCoalescedEvents?.() || [event];
  for (const sample of samples) appendPointerEvent(sample);
  scheduleRender();
}

function commitCurrentAction(stroke) {
  const layer = activeLayer();
  if (!layer) return;
  delete stroke.snapped;
  layer.strokes.push(stroke);
  pushHistory({ kind: 'stroke', layerId: layer.id, stroke: cloneValue(stroke) });
  currentStroke = null;
  eraserBackup = null;
  clearStrokeSurface();
  elements.editor.classList.remove('is-drawing');
  preferences.set('onboarded', true);
  elements.gestureHint.classList.add('is-dismissed');
  updateHistoryButtons();
  markDirty();
  requestPersistentStorage();
  noteDrawingAction();
  scheduleRender();
}

function finishStroke(event) {
  clearHoldTimers();
  holdOrigin = null;
  if (selectionGesture) {
    finishSelectionGesture();
    return;
  }
  if (!currentStroke || gestureConsumed) return;
  appendPointerEvent(event, true);
  const stroke = currentStroke;
  const surface = layerSurface();

  if (stroke.tool === 'fill') {
    let changed = 0;
    try {
      changed = floodFillContext(
        surface?.context,
        stroke,
        currentDrawing.width,
        currentDrawing.height,
        currentDrawing.background
      );
    } catch (error) {
      console.warn('Fill action failed', error);
      currentStroke = null;
      elements.editor.classList.remove('is-drawing');
      showToast('Заливка не сработала', 'error');
      scheduleRender();
      return;
    }
    if (changed === 0) {
      currentStroke = null;
      elements.editor.classList.remove('is-drawing');
      showToast('Здесь уже этот цвет');
      scheduleRender();
      return;
    }
    animateFillBloom(event.clientX, event.clientY, stroke.color);
    rebuildComposite();
    commitCurrentAction(stroke);
    return;
  }

  if (!stroke.shape) {
    const tolerance = Math.max(0.45, stroke.size * 0.018);
    stroke.points = simplifyPoints(stroke.points, tolerance);
  }

  if (currentDrawing.canvasMode !== 'infinite' && stroke.tool !== 'eraser') {
    surface.context.save();
    surface.context.globalAlpha = TOOL_DEFS[stroke.tool].opacity;
    surface.context.drawImage(strokeCanvas, 0, 0);
    surface.context.restore();
  }
  rebuildComposite();
  commitCurrentAction(stroke);
}

function cancelStroke() {
  clearHoldTimers();
  holdOrigin = null;
  if (selectionGesture) {
    if (selectionGesture.beforeLayers) {
      currentDrawing.layers = selectionGesture.beforeLayers;
      ensureDocumentSurfaces();
    }
    selectionGesture = null;
    elements.editor.classList.remove('is-drawing');
    scheduleRender();
    return;
  }
  if (!currentStroke) return;
  if (currentStroke.tool === 'eraser' && eraserBackup && currentDrawing.canvasMode !== 'infinite') {
    const surface = layerSurface();
    surface.context.clearRect(0, 0, currentDrawing.width, currentDrawing.height);
    surface.context.drawImage(eraserBackup, 0, 0);
    rebuildComposite();
  }
  currentStroke = null;
  eraserBackup = null;
  clearStrokeSurface();
  elements.editor.classList.remove('is-drawing');
  scheduleRender();
}

function pinchPair() {
  return [...pointers.values()].slice(0, 2);
}

function beginPinch() {
  const [a, b] = pinchPair();
  if (!a || !b) return;
  const firstPoint = screenToDocument(a.clientX, a.clientY);
  const secondPoint = screenToDocument(b.clientX, b.clientY);
  const bounds = selectedBounds();
  const selectionPadding = 30 / currentDocumentScale();
  const bothInsideSelection = selectedTool() === 'select' && selection && bounds
    && [firstPoint, secondPoint].every((point) => (
      point.x >= bounds.minX - selectionPadding && point.x <= bounds.maxX + selectionPadding
      && point.y >= bounds.minY - selectionPadding && point.y <= bounds.maxY + selectionPadding
    ));
  if (bothInsideSelection) {
    const beforeLayers = selectionGesture?.beforeLayers || cloneLayers();
    const originalStrokes = selectionGesture?.originalStrokes || cloneValue(selectionLayer().strokes);
    selectionGesture = null;
    suppressDrawingUntilClear = true;
    const center = { x: (firstPoint.x + secondPoint.x) * 0.5, y: (firstPoint.y + secondPoint.y) * 0.5 };
    pinch = {
      kind: 'selection',
      distance: Math.max(1, distance(firstPoint, secondPoint)),
      angle: Math.atan2(secondPoint.y - firstPoint.y, secondPoint.x - firstPoint.x),
      center,
      origin: { x: (bounds.minX + bounds.maxX) * 0.5, y: (bounds.minY + bounds.maxY) * 0.5 },
      beforeLayers,
      originalStrokes,
      changed: false
    };
    return;
  }
  cancelStroke();
  suppressDrawingUntilClear = true;
  const center = { x: (a.clientX + b.clientX) * 0.5, y: (a.clientY + b.clientY) * 0.5 };
  const documentPoint = screenToDocument(center.x, center.y);
  pinch = {
    kind: 'canvas',
    distance: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)),
    zoom: view.zoom,
    documentPoint
  };
}

function movePinch() {
  const [a, b] = pinchPair();
  if (!pinch || !a || !b) return;
  if (pinch.kind === 'selection' && selection) {
    const firstPoint = screenToDocument(a.clientX, a.clientY);
    const secondPoint = screenToDocument(b.clientX, b.clientY);
    const currentCenter = { x: (firstPoint.x + secondPoint.x) * 0.5, y: (firstPoint.y + secondPoint.y) * 0.5 };
    const currentDistance = Math.max(1, distance(firstPoint, secondPoint));
    const currentAngle = Math.atan2(secondPoint.y - firstPoint.y, secondPoint.x - firstPoint.x);
    const scale = clamp(currentDistance / pinch.distance, 0.12, 8);
    const rotation = currentAngle - pinch.angle;
    const selectedIds = new Set(selection.strokeIds);
    const layer = selectionLayer();
    layer.strokes = pinch.originalStrokes.map((stroke) => selectedIds.has(stroke.id)
      ? transformStroke(stroke, {
          originX: pinch.origin.x,
          originY: pinch.origin.y,
          translateX: currentCenter.x - pinch.center.x,
          translateY: currentCenter.y - pinch.center.y,
          scale,
          rotation
        })
      : cloneValue(stroke));
    pinch.changed = Math.abs(scale - 1) > 0.01 || Math.abs(rotation) > 0.01
      || distance(currentCenter, pinch.center) > 2 / currentDocumentScale();
    rebuildLayerSurface(layer.id);
    scheduleRender();
    return;
  }
  const currentDistance = Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY));
  const center = { x: (a.clientX + b.clientX) * 0.5, y: (a.clientY + b.clientY) * 0.5 };
  const rect = elements.canvas.getBoundingClientRect();
  view.zoom = clamp(
    pinch.zoom * (currentDistance / pinch.distance),
    currentDrawing.canvasMode === 'infinite' ? 0.35 : 1,
    currentDrawing.canvasMode === 'infinite' ? 8 : 6
  );
  const scale = currentDocumentScale();
  view.panX = center.x - rect.left - displayBox.width * 0.5
    - (pinch.documentPoint.x - currentDrawing.width * 0.5) * scale;
  view.panY = center.y - rect.top - displayBox.height * 0.5
    - (pinch.documentPoint.y - currentDrawing.height * 0.5) * scale;
  clampView();
  scheduleRender();
}

function handlePointerDown(event) {
  if (event.button !== 0 && event.pointerType === 'mouse') return;
  event.preventDefault();
  if (viewAnimationFrame) cancelAnimationFrame(viewAnimationFrame);
  viewAnimationFrame = 0;
  capturePointer(elements.canvas, event.pointerId);
  pointers.set(event.pointerId, event);
  if (pointers.size === 1) beginStroke(event);
  else if (pointers.size === 2) beginPinch();
}

function handlePointerMove(event) {
  if (!pointers.has(event.pointerId)) return;
  event.preventDefault();
  pointers.set(event.pointerId, event);
  if (pointers.size >= 2 || pinch) movePinch();
  else if (currentStroke || selectionGesture) moveStroke(event);
}

function finishPointer(event, cancelled = false) {
  if (!pointers.has(event.pointerId)) return;
  const wasPinching = Boolean(pinch || suppressDrawingUntilClear);
  pointers.delete(event.pointerId);
  releasePointer(elements.canvas, event.pointerId);
  if (wasPinching) {
    if (pinch?.kind === 'selection' && pointers.size < 2) {
      if (cancelled) {
        currentDrawing.layers = pinch.beforeLayers;
        ensureDocumentSurfaces();
      } else if (pinch.changed) {
        pushHistory({ kind: 'layers', before: pinch.beforeLayers, after: cloneLayers() });
        markDirty();
        noteDrawingAction();
      }
      pinch = null;
      elements.editor.classList.remove('is-drawing');
      scheduleRender();
    } else if (pinch?.kind !== 'selection') {
      cancelStroke();
    }
    if (pointers.size === 0) {
      pinch = null;
      suppressDrawingUntilClear = false;
      gestureConsumed = false;
    }
    return;
  }
  if (cancelled) cancelStroke();
  else finishStroke(event);
  if (pointers.size === 0) gestureConsumed = false;
}

function resetView(animated = false) {
  if (viewAnimationFrame) cancelAnimationFrame(viewAnimationFrame);
  viewAnimationFrame = 0;
  if (!animated) {
    view.zoom = 1;
    view.panX = 0;
    view.panY = 0;
    clampView();
    scheduleRender();
    return;
  }

  const from = { zoom: view.zoom, panX: view.panX, panY: view.panY };
  const startedAt = performance.now();
  const tick = (now) => {
    const progress = clamp((now - startedAt) / 240, 0, 1);
    const eased = 1 - (1 - progress) ** 3;
    view.zoom = from.zoom + (1 - from.zoom) * eased;
    view.panX = from.panX * (1 - eased);
    view.panY = from.panY * (1 - eased);
    clampView();
    scheduleRender();
    if (progress < 1) viewAnimationFrame = requestAnimationFrame(tick);
    else viewAnimationFrame = 0;
  };
  viewAnimationFrame = requestAnimationFrame(tick);
}

function rebuildDocument() {
  if (!currentDrawing) return;
  ensureDocumentSurfaces();
  scheduleRender();
}

function applyHistory(entry, direction) {
  if (entry.kind === 'stroke') {
    const layer = currentLayers().find((candidate) => candidate.id === entry.layerId);
    if (!layer) return;
    if (direction === 'undo') {
      layer.strokes = layer.strokes.filter((stroke) => stroke.id !== entry.stroke.id);
    } else if (!layer.strokes.some((stroke) => stroke.id === entry.stroke.id)) {
      layer.strokes.push(cloneValue(entry.stroke));
      layer.strokes.sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));
    }
  } else if (entry.kind === 'layers') {
    currentDrawing.layers = cloneValue(direction === 'undo' ? entry.before : entry.after);
    if (!currentLayers().some((layer) => layer.id === currentDrawing.activeLayerId)) {
      currentDrawing.activeLayerId = currentLayers().at(-1)?.id;
    }
    setSelection(null);
    updateLayerBadge();
  }
  rebuildDocument();
}

function undo() {
  if (!undoStack.length || currentStroke || selectionGesture) return;
  const entry = undoStack.pop();
  applyHistory(entry, 'undo');
  redoStack.push(entry);
  updateHistoryButtons();
  markDirty();
  noteDrawingAction();
  restartAnimation(elements.canvas, 'is-history-changing', 240);
}

function redo() {
  if (!redoStack.length || currentStroke || selectionGesture) return;
  const entry = redoStack.pop();
  applyHistory(entry, 'redo');
  undoStack.push(entry);
  updateHistoryButtons();
  markDirty();
  noteDrawingAction();
  restartAnimation(elements.canvas, 'is-history-changing', 240);
}

function makeSnapshot(drawing = currentDrawing) {
  const snapshot = cloneValue(drawing);
  snapshot.updatedAt = new Date().toISOString();
  return snapshot;
}

function renderDrawingToCanvas(drawing, maximumWidth = drawing.width) {
  const isInfinite = drawing.canvasMode === 'infinite';
  const bounds = isInfinite ? drawingContentBounds(drawing) : null;
  const padding = isInfinite ? Math.max(54, Math.max(bounds.width, bounds.height) * 0.08) : 0;
  const sourceWidth = isInfinite ? bounds.width + padding * 2 : drawing.width;
  const sourceHeight = isInfinite ? bounds.height + padding * 2 : drawing.height;
  const maximumHeight = Math.max(maximumWidth, maximumWidth * 1.55);
  const scale = Math.min(1, maximumWidth / sourceWidth, maximumHeight / sourceHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = isInfinite ? '#f1ece2' : drawing.background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (!isInfinite && drawing.id === currentDrawing?.id && documentCanvas) {
    context.drawImage(documentCanvas, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  const paint = document.createElement('canvas');
  paint.width = canvas.width;
  paint.height = canvas.height;
  const paintContext = paint.getContext('2d', { alpha: true });
  if (isInfinite) replayDrawingRegion(paintContext, drawing, bounds, paint.width, paint.height, { padding });
  else replayDrawingScaled(paintContext, drawing, paint.width, paint.height);
  context.drawImage(paint, 0, 0);
  return canvas;
}

function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode canvas')), type, quality);
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, encoded] = dataUrl.split(',');
  const mime = header.match(/data:([^;]+)/)?.[1] || 'image/png';
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

function exportBlobSync(drawing) {
  const canvas = drawing.id === currentDrawing?.id && documentCanvas
    ? (() => {
        const output = document.createElement('canvas');
        output.width = drawing.width;
        output.height = drawing.height;
        const context = output.getContext('2d', { alpha: false });
        context.fillStyle = drawing.background;
        context.fillRect(0, 0, output.width, output.height);
        context.drawImage(documentCanvas, 0, 0);
        return output;
      })()
    : renderDrawingToCanvas(drawing);
  return dataUrlToBlob(canvas.toDataURL('image/png'));
}

async function makeThumbnail(drawing) {
  return canvasToBlob(renderDrawingToCanvas(drawing, 320), 'image/jpeg', 0.82);
}

function versionSnapshot(drawing = currentDrawing) {
  return {
    schema: 2,
    canvasMode: drawing.canvasMode,
    width: drawing.width,
    height: drawing.height,
    background: drawing.background,
    layers: cloneValue(drawing.layers),
    activeLayerId: drawing.activeLayerId,
    nextSequence: drawing.nextSequence
  };
}

function createDrawingVersion(label = 'Автосохранение', force = false) {
  if (!currentDrawing || !database || (!force && actionsSinceVersion === 0)) return versionQueue;
  const drawingId = currentDrawing.id;
  const createdAt = new Date().toISOString();
  const version = {
    id: makeId('version'),
    drawingId,
    createdAt,
    label,
    actionCount: drawingActionCount(currentDrawing),
    snapshot: versionSnapshot()
  };
  currentDrawing.versionedAt = createdAt;
  actionsSinceVersion = 0;
  versionQueue = versionQueue.then(async () => {
    await database.putVersion(version);
    await database.pruneVersions(drawingId, VERSION_LIMIT);
  }).catch((error) => console.warn('Could not create drawing version', error));
  return versionQueue;
}

function maybeCreateAutomaticVersion() {
  if (!currentDrawing || actionsSinceVersion === 0) return;
  const last = Date.parse(currentDrawing.versionedAt || currentDrawing.createdAt || 0);
  if (actionsSinceVersion >= VERSION_ACTION_INTERVAL || Date.now() - last >= VERSION_TIME_INTERVAL) {
    createDrawingVersion('Автоверсия');
  }
}

function noteDrawingAction() {
  actionsSinceVersion += 1;
  maybeCreateAutomaticVersion();
}

function markDirty() {
  if (!currentDrawing) return;
  saveRevision += 1;
  setSaveStatus('Сохраняю…', 'saving');
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => queueSave(true), 420);
}

function queueSave(withThumbnail = false) {
  if (!currentDrawing || !database) return saveQueue;
  window.clearTimeout(saveTimer);
  const revision = saveRevision;
  const drawingId = currentDrawing.id;
  const snapshot = makeSnapshot(currentDrawing);
  currentDrawing.updatedAt = snapshot.updatedAt;

  saveQueue = saveQueue.then(async () => {
    try {
      if (withThumbnail) {
        snapshot.thumbnail = await makeThumbnail(snapshot);
        snapshot.thumbnailRenderVersion = THUMBNAIL_RENDER_VERSION;
      }
      await database.put(snapshot);
      if (currentDrawing?.id === drawingId && revision >= savedRevision) {
        if (snapshot.thumbnail) currentDrawing.thumbnail = snapshot.thumbnail;
        savedRevision = revision;
        if (revision === saveRevision) setSaveStatus('Сохранено', 'saved');
        else setSaveStatus('Сохраняю…', 'saving');
      }
    } catch (error) {
      console.warn('Could not save drawing', error);
      if (currentDrawing?.id === drawingId) {
        setSaveStatus('Не сохранено', 'error');
        showToast('Не удалось сохранить рисунок', 'error');
      }
    }
  });
  return saveQueue;
}

async function saveNow() {
  if (!currentDrawing || savedRevision === saveRevision) return saveQueue;
  return queueSave(true);
}

function revokeGalleryUrls() {
  for (const url of galleryObjectUrls) URL.revokeObjectURL(url);
  galleryObjectUrls = [];
}

function invalidateGalleryJobs() {
  galleryGeneration += 1;
  pendingThumbnailJobs = [];
}

function waitForIdleWork() {
  return new Promise((resolve) => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => resolve(), { timeout: 700 });
      return;
    }
    window.setTimeout(resolve, 140);
  });
}

function attachThumbnail(preview, article, blob) {
  if (!(blob instanceof Blob)) return;
  const url = URL.createObjectURL(blob);
  galleryObjectUrls.push(url);
  const image = document.createElement('img');
  image.alt = '';
  image.decoding = 'async';
  image.addEventListener('load', () => {
    if (article.isConnected) preview.classList.add('is-ready');
  }, { once: true });
  image.addEventListener('error', () => {
    if (article.isConnected) preview.classList.add('has-error');
  }, { once: true });
  image.src = url;
  preview.append(image);
}

function startThumbnailWorker() {
  if (thumbnailWorkerRunning) return;
  thumbnailWorkerRunning = true;
  void (async () => {
    while (pendingThumbnailJobs.length) {
      const job = pendingThumbnailJobs.shift();
      await waitForIdleWork();
      if (job.generation !== galleryGeneration || !job.article.isConnected || openingDrawingId) continue;

      try {
        const blob = await makeThumbnail(job.drawing);
        if (job.generation !== galleryGeneration || !job.article.isConnected || openingDrawingId) continue;
        attachThumbnail(job.preview, job.article, blob);

        const latest = await database?.get(job.drawing.id);
        if (!latest || latest.updatedAt !== job.drawing.updatedAt || job.generation !== galleryGeneration) continue;
        latest.thumbnail = blob;
        latest.thumbnailRenderVersion = THUMBNAIL_RENDER_VERSION;
        await database.put(latest);
      } catch (error) {
        console.warn('Could not build gallery preview', error);
        if (job.article.isConnected) job.preview.classList.add('has-error');
      }
    }
  })().finally(() => {
    thumbnailWorkerRunning = false;
    if (pendingThumbnailJobs.length) startThumbnailWorker();
  });
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Недавно';
  return new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

function drawingCard(drawing, index, generation, thumbnailJobs) {
  const article = document.createElement('article');
  article.className = 'drawing-card';
  article.style.setProperty('--tilt', `${[-1.1, 0.6, -0.35, 0.9][index % 4]}deg`);
  article.style.setProperty('--card-index', String(index));
  article.style.setProperty('--card-delay', `${Math.min(index, 6) * 45}ms`);

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'drawing-open';
  open.dataset.nativePress = '';
  open.setAttribute('aria-label', `Открыть рисунок ${drawing.title}`);

  const preview = document.createElement('span');
  preview.className = 'drawing-preview';
  preview.style.aspectRatio = `${drawing.width} / ${drawing.height}`;
  const shimmer = document.createElement('i');
  preview.append(shimmer);
  open.append(preview);

  const caption = document.createElement('span');
  caption.className = 'drawing-caption';
  const title = document.createElement('strong');
  title.textContent = drawing.title || 'Без названия';
  const date = document.createElement('small');
  date.textContent = formatDate(drawing.updatedAt);
  caption.append(title, date);
  open.append(caption);
  open.addEventListener('click', () => openDrawing(drawing.id, article));

  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'drawing-more';
  more.dataset.nativePress = '';
  more.setAttribute('aria-label', `Действия с рисунком ${drawing.title}`);
  more.innerHTML = '<svg><use href="#i-more"></use></svg>';
  more.addEventListener('click', () => openActionsSheet(drawing.id, drawing));

  article.append(open, more);
  if (drawing.thumbnail instanceof Blob) attachThumbnail(preview, article, drawing.thumbnail);
  else thumbnailJobs.push({ drawing, article, preview, generation });
  return article;
}

async function renderGallery() {
  if (!database) return;
  const generation = ++galleryGeneration;
  revokeGalleryUrls();
  const all = (await database.getAll()).filter(isValidDrawing).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  if (generation !== galleryGeneration) return;
  const thumbnailJobs = [];
  elements.galleryCount.textContent = drawingCountLabel(all.length);
  elements.galleryGrid.replaceChildren(...all.map((drawing, index) => drawingCard(drawing, index, generation, thumbnailJobs)));
  elements.emptyGallery.hidden = all.length > 0;
  elements.galleryGrid.hidden = all.length === 0;
  pendingThumbnailJobs.push(...thumbnailJobs);
  startThumbnailWorker();
}

async function showGallery() {
  cancelStroke();
  await createDrawingVersion('Перед выходом');
  await saveNow();
  await versionQueue;
  closeSheet();
  openingDrawingId = null;
  elements.gallery.classList.remove('is-opening');
  await renderGallery();
  elements.editor.hidden = true;
  elements.gallery.hidden = false;
  elements.startup.hidden = true;
  elements.app.dataset.screen = 'gallery';
  animateScreenEntry(elements.gallery, 'back');
}

async function showEditor(drawing) {
  const normalized = normalizeDrawingDocument(drawing);
  if (!normalized) throw new Error('Drawing data is damaged');
  const canReuseSurface = Boolean(
    documentCanvas
    && currentDrawing?.id === normalized.id
    && currentDrawing.updatedAt === normalized.updatedAt
    && drawingActionCount(currentDrawing) === drawingActionCount(normalized)
  );
  currentDrawing = normalized;
  if (drawing.schema !== normalized.schema) await database.put(normalized);
  undoStack = currentLayers()
    .flatMap((layer) => layer.strokes.map((stroke) => ({ kind: 'stroke', layerId: layer.id, stroke: cloneValue(stroke) })))
    .sort((a, b) => (Number(a.stroke.seq) || 0) - (Number(b.stroke.seq) || 0))
    .slice(-60);
  redoStack = [];
  actionsSinceVersion = 0;
  setSelection(null);
  saveRevision = 0;
  savedRevision = 0;
  preferences.set('activeDrawingId', normalized.id);
  if (normalized.canvasMode === 'infinite' && selectedTool() === 'fill') preferences.set('tool', 'ink');
  if (!canReuseSurface) ensureDocumentSurfaces();
  resetView();
  elements.documentTitle.textContent = normalized.title || 'Без названия';
  elements.editor.dataset.canvasMode = normalized.canvasMode;
  setSaveStatus('Сохранено', 'saved');
  updateHistoryButtons();
  updateLayerBadge();
  renderPaperColors();
  syncToolInterface();
  syncColorInterface();
  elements.gallery.hidden = true;
  elements.editor.hidden = false;
  invalidateGalleryJobs();
  revokeGalleryUrls();
  elements.app.dataset.screen = 'editor';
  elements.startup.hidden = true;
  animateScreenEntry(elements.editor, 'forward');
  requestAnimationFrame(resizeDisplayCanvas);
}

function waitForNextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function openDrawing(id, article = null) {
  if (openingDrawingId) return;
  openingDrawingId = id;
  invalidateGalleryJobs();
  elements.gallery.classList.add('is-opening');
  article?.classList.add('is-opening');
  article?.querySelector('.drawing-open')?.setAttribute('aria-busy', 'true');
  try {
    await saveNow();
    await waitForNextPaint();
    const drawing = await database.get(id);
    if (!isValidDrawing(drawing)) throw new Error('Drawing could not be loaded');
    await showEditor(drawing);
  } catch (error) {
    console.warn(error);
    showToast('Не удалось открыть рисунок', 'error');
  } finally {
    openingDrawingId = null;
    elements.gallery.classList.remove('is-opening');
    article?.classList.remove('is-opening');
    article?.querySelector('.drawing-open')?.removeAttribute('aria-busy');
  }
}

function openNewDrawingSheet() {
  openSheet(elements.newSheet);
}

async function createNewDrawing(canvasMode = 'sheet') {
  try {
    await saveNow();
    const viewport = runtime.getViewportState();
    const drawing = createDrawingDocument(viewport.width, viewport.height, {
      background: preferences.get('paper', PAPER_COLORS[0]),
      canvasMode
    });
    await database.put(drawing);
    requestPersistentStorage();
    closeSheet();
    await showEditor(drawing);
    showToast(canvasMode === 'infinite' ? 'Бесконечный простор готов' : 'Чистый лист готов');
  } catch (error) {
    fail(error, 'Не удалось создать новый лист. Проверь, хватает ли памяти на устройстве.');
  }
}

function cachedTargetDrawing() {
  if (!actionsTargetId || actionsTargetId === currentDrawing?.id) return currentDrawing;
  if (actionsTargetCache?.id === actionsTargetId) return actionsTargetCache;
  return null;
}

async function resolveTargetDrawing() {
  return cachedTargetDrawing() || database.get(actionsTargetId);
}

function openActionsSheet(id = currentDrawing?.id, drawing = null) {
  actionsTargetId = id;
  actionsTargetCache = drawing?.id === id ? drawing : (id === currentDrawing?.id ? currentDrawing : null);
  const isActive = id === currentDrawing?.id && !elements.editor.hidden;
  elements.focusAction.hidden = !isActive;
  elements.clearAction.hidden = false;
  $('span', elements.clearAction).textContent = isActive ? 'Очистить лист' : 'Удалить рисунок';
  elements.actionsKicker.textContent = isActive ? 'Рисунок сохранён автоматически' : 'Рисунок в галерее';
  elements.actionsSheetTitle.textContent = 'Что сделать';
  openSheet(elements.actionsSheet);
}

function withExportBusy(action) {
  return async () => {
    if (elements.actionsSheet.dataset.busy === 'true') return;
    elements.actionsSheet.dataset.busy = 'true';
    for (const button of $$('button', elements.actionsSheet)) button.disabled = true;
    try {
      await action();
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.warn('Export action failed', error);
        showToast('Не получилось. Попробуй ещё раз', 'error');
      }
    } finally {
      elements.actionsSheet.dataset.busy = 'false';
      for (const button of $$('button', elements.actionsSheet)) button.disabled = false;
    }
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

async function copyTarget() {
  const drawing = cachedTargetDrawing() || await resolveTargetDrawing();
  const blob = exportBlobSync(drawing);
  if (navigator.clipboard?.write && globalThis.ClipboardItem && window.isSecureContext) {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    closeSheet();
    showToast('PNG скопирован');
    return;
  }
  downloadBlob(blob, `${safeFileStem(drawing.title)}.png`);
  closeSheet();
  showToast('Буфер недоступен — PNG сохранён');
}

async function shareTarget() {
  const drawing = cachedTargetDrawing() || await resolveTargetDrawing();
  const blob = exportBlobSync(drawing);
  const file = new File([blob], `${safeFileStem(drawing.title)}.png`, { type: 'image/png' });
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    await navigator.share({ title: drawing.title, text: `Рисунок из ${APP_NAME}`, files: [file] });
    closeSheet();
    return;
  }
  downloadBlob(blob, file.name);
  closeSheet();
  showToast('Отправка недоступна — PNG сохранён');
}

async function downloadTarget() {
  const drawing = cachedTargetDrawing() || await resolveTargetDrawing();
  downloadBlob(exportBlobSync(drawing), `${safeFileStem(drawing.title)}.png`);
  closeSheet();
  showToast('PNG сохранён');
}

async function duplicateTarget() {
  const source = await resolveTargetDrawing();
  const timestamp = new Date().toISOString();
  const copy = cloneValue(source);
  copy.id = makeId();
  copy.title = `${source.title || 'Без названия'} — копия`.slice(0, 48);
  copy.createdAt = timestamp;
  copy.updatedAt = timestamp;
  copy.thumbnail = source.thumbnail instanceof Blob ? source.thumbnail : null;
  await database.put(copy);
  closeSheet();
  showToast('Копия создана');
  if (!elements.editor.hidden) await showEditor(copy);
  else await renderGallery();
}

async function saveTitle() {
  const title = elements.titleInput.value.trim().replace(/\s+/g, ' ').slice(0, 48) || 'Без названия';
  const id = renameTargetId || currentDrawing?.id;
  if (!id) return;
  if (id === currentDrawing?.id) {
    currentDrawing.title = title;
    elements.documentTitle.textContent = title;
    markDirty();
  } else {
    const drawing = await database.get(id);
    if (!isValidDrawing(drawing)) throw new Error('Drawing not found');
    drawing.title = title;
    drawing.updatedAt = new Date().toISOString();
    await database.put(drawing);
    await renderGallery();
  }
  closeSheet();
  showToast('Название сохранено');
}

function clearCurrentDrawing() {
  if (!currentDrawing || drawingActionCount(currentDrawing) === 0) {
    closeSheet();
    showToast('Лист и так чистый');
    return;
  }
  openConfirm({
    title: 'Очистить весь лист?',
    copy: 'Все мазки исчезнут. Вернуться можно через отмену или версии.',
    acceptLabel: 'Очистить',
    onAccept() {
      createDrawingVersion('Перед очисткой', true);
      const before = cloneLayers();
      for (const layer of currentLayers()) layer.strokes = [];
      pushHistory({ kind: 'layers', before, after: cloneLayers() });
      setSelection(null);
      rebuildDocument();
      updateHistoryButtons();
      markDirty();
      noteDrawingAction();
      closeSheet();
      showToast('Лист очищен');
    }
  });
}

async function deleteDrawing(id) {
  const drawing = id === currentDrawing?.id ? currentDrawing : await database.get(id);
  if (!drawing) return;
  openConfirm({
    title: `Удалить «${drawing.title || 'Без названия'}»?`,
    copy: 'Рисунок исчезнет с этого устройства навсегда.',
    acceptLabel: 'Удалить',
    async onAccept() {
      await database.remove(id);
      if (currentDrawing?.id === id) {
        currentDrawing = null;
        preferences.set('activeDrawingId', null);
      }
      closeSheet();
      showToast('Рисунок удалён');
      await renderGallery();
    }
  });
}

function commitLayerMutation(mutator, toastMessage = '') {
  if (!currentDrawing) return;
  const before = cloneLayers();
  mutator();
  const after = cloneLayers();
  pushHistory({ kind: 'layers', before, after });
  setSelection(null);
  ensureDocumentSurfaces();
  updateLayerBadge();
  renderLayerList();
  markDirty();
  noteDrawingAction();
  if (toastMessage) showToast(toastMessage);
}

function renderLayerList() {
  if (!currentDrawing || !elements.layerList) return;
  const rows = [...currentLayers()].reverse().map((layer) => {
    const row = document.createElement('article');
    row.className = 'layer-row';
    row.classList.toggle('is-active', layer.id === currentDrawing.activeLayerId);
    row.classList.toggle('is-hidden', !layer.visible);

    const visibility = document.createElement('button');
    visibility.type = 'button';
    visibility.className = 'layer-visibility';
    visibility.dataset.nativePress = '';
    visibility.setAttribute('aria-label', layer.visible ? `Скрыть ${layer.name}` : `Показать ${layer.name}`);
    visibility.innerHTML = `<svg><use href="#${layer.visible ? 'i-eye' : 'i-eye-off'}"></use></svg>`;
    visibility.addEventListener('click', () => commitLayerMutation(() => {
      const target = currentLayers().find((candidate) => candidate.id === layer.id);
      target.visible = !target.visible;
    }));

    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'layer-select';
    select.dataset.nativePress = '';
    select.innerHTML = `<strong></strong><small></small>`;
    $('strong', select).textContent = layer.name;
    $('small', select).textContent = `${layer.strokes.length} мазков · ${Math.round(layer.opacity * 100)}%`;
    select.addEventListener('click', () => {
      currentDrawing.activeLayerId = layer.id;
      setSelection(null);
      renderLayerList();
      syncLayerControls();
      rebuildComposite();
      markDirty();
      restartAnimation(elements.layersButton, 'is-layer-changing', 330);
      scheduleRender();
    });
    const handle = document.createElement('i');
    handle.setAttribute('aria-hidden', 'true');
    row.append(visibility, select, handle);
    return row;
  });
  elements.layerList.replaceChildren(...rows);
  syncLayerControls();
  runtime.refreshControls(elements.layersSheet);
}

function syncLayerControls() {
  const layer = activeLayer();
  if (!layer) return;
  const index = currentLayers().indexOf(layer);
  const merge = activeLayerMergeStatus();
  elements.layerOpacity.value = String(Math.round(layer.opacity * 100));
  elements.layerOpacityValue.value = `${Math.round(layer.opacity * 100)}%`;
  elements.layerOpacityValue.textContent = `${Math.round(layer.opacity * 100)}%`;
  elements.layerDown.disabled = index <= 0;
  elements.layerMerge.disabled = !merge.allowed;
  elements.layerMerge.title = merge.reason;
  elements.layerUp.disabled = index >= currentLayers().length - 1;
  elements.layerDelete.disabled = currentLayers().length <= 1;
  elements.addLayerButton.disabled = currentLayers().length >= MAX_LAYERS;
  elements.addLayerButton.textContent = currentLayers().length >= MAX_LAYERS ? 'Пять слоёв — потолок' : 'Добавить слой';
  if (!elements.addLayerButton.disabled) {
    elements.addLayerButton.innerHTML = '<svg><use href="#i-plus"></use></svg>Добавить слой';
  }
}

function openLayersSheet() {
  renderLayerList();
  openSheet(elements.layersSheet);
}

function addLayer() {
  if (currentLayers().length >= MAX_LAYERS) {
    showToast('Пять слоёв уже есть');
    return;
  }
  commitLayerMutation(() => {
    const layer = createDrawingLayer(`Слой ${currentLayers().length + 1}`);
    currentDrawing.layers.push(layer);
    currentDrawing.activeLayerId = layer.id;
  }, 'Слой добавлен');
}

function moveActiveLayer(direction) {
  const index = currentLayers().findIndex((layer) => layer.id === currentDrawing.activeLayerId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= currentLayers().length) return;
  commitLayerMutation(() => {
    const [layer] = currentDrawing.layers.splice(index, 1);
    currentDrawing.layers.splice(target, 0, layer);
  });
}

function activeLayerMergeStatus() {
  const index = currentLayers().findIndex((layer) => layer.id === currentDrawing?.activeLayerId);
  if (index <= 0) return { allowed: false, reason: 'Под этим слоем ничего нет' };
  const upper = currentLayers()[index];
  const lower = currentLayers()[index - 1];
  if (Math.abs(upper.opacity - 1) > 0.001 || Math.abs(lower.opacity - 1) > 0.001) {
    return { allowed: false, reason: 'Для точного слияния верни прозрачность обоих слоёв на 100%' };
  }
  if (upper.strokes.some((stroke) => stroke.tool === 'eraser' || stroke.tool === 'fill')) {
    return { allowed: false, reason: 'Верхний слой с заливкой или ластиком нельзя слить без изменения рисунка' };
  }
  return { allowed: true, reason: '' };
}

function mergeActiveLayerDown() {
  const index = currentLayers().findIndex((layer) => layer.id === currentDrawing.activeLayerId);
  const status = activeLayerMergeStatus();
  if (index <= 0 || !status.allowed) {
    if (status.reason) showToast(status.reason, 'error');
    return;
  }
  commitLayerMutation(() => {
    const upper = currentDrawing.layers[index];
    const lower = currentDrawing.layers[index - 1];
    lower.strokes.push(...upper.strokes);
    lower.name = `${lower.name} + ${upper.name}`.slice(0, 32);
    currentDrawing.layers.splice(index, 1);
    currentDrawing.activeLayerId = lower.id;
  }, 'Слои объединены');
}

function deleteActiveLayer() {
  const layer = activeLayer();
  if (!layer || currentLayers().length <= 1) return;
  const remove = () => {
    commitLayerMutation(() => {
      const index = currentLayers().findIndex((candidate) => candidate.id === layer.id);
      currentDrawing.layers.splice(index, 1);
      currentDrawing.activeLayerId = currentDrawing.layers[Math.max(0, index - 1)]?.id || currentDrawing.layers[0].id;
    }, 'Слой удалён');
    openLayersSheet();
  };
  if (!layer.strokes.length) {
    remove();
    return;
  }
  openConfirm({
    title: `Удалить «${layer.name}»?`,
    copy: `${layer.strokes.length} мазков исчезнут. Кнопка отмены сможет вернуть слой.`,
    acceptLabel: 'Удалить слой',
    onAccept: remove
  });
}

function transformSelectionOnce(transform) {
  const layer = selectionLayer();
  const bounds = selectedBounds();
  if (!layer || !bounds) return;
  const before = cloneLayers();
  const ids = new Set(selection.strokeIds);
  layer.strokes = layer.strokes.map((stroke) => ids.has(stroke.id)
    ? transformStroke(stroke, {
        originX: (bounds.minX + bounds.maxX) * 0.5,
        originY: (bounds.minY + bounds.maxY) * 0.5,
        ...transform
      })
    : stroke);
  pushHistory({ kind: 'layers', before, after: cloneLayers() });
  rebuildLayerSurface(layer.id);
  markDirty();
  noteDrawingAction();
  scheduleRender();
}

function copySelection() {
  const layer = selectionLayer();
  if (!layer || !selection?.strokeIds.length) return;
  const before = cloneLayers();
  const ids = new Set(selection.strokeIds);
  const offset = 22 / currentDocumentScale();
  const copies = layer.strokes.filter((stroke) => ids.has(stroke.id)).map((stroke) => ({
    ...transformStroke(cloneValue(stroke), { translateX: offset, translateY: offset }),
    id: makeId('stroke'),
    seq: nextSequence(),
    createdAt: new Date().toISOString()
  }));
  layer.strokes.push(...copies);
  selection.strokeIds = copies.map((stroke) => stroke.id);
  pushHistory({ kind: 'layers', before, after: cloneLayers() });
  rebuildLayerSurface(layer.id);
  markDirty();
  noteDrawingAction();
  showToast('Выделение скопировано');
}

function deleteSelection() {
  const layer = selectionLayer();
  if (!layer || !selection?.strokeIds.length) return;
  const before = cloneLayers();
  const ids = new Set(selection.strokeIds);
  layer.strokes = layer.strokes.filter((stroke) => !ids.has(stroke.id));
  pushHistory({ kind: 'layers', before, after: cloneLayers() });
  rebuildLayerSurface(layer.id);
  setSelection(null);
  markDirty();
  noteDrawingAction();
  showToast('Удалено · можно отменить');
}

async function openVersionsSheet() {
  versionsTargetId = actionsTargetId || currentDrawing?.id;
  if (!versionsTargetId) return;
  const versions = await database.getVersions(versionsTargetId);
  elements.versionList.replaceChildren(...versions.map((version) => {
    const row = document.createElement('article');
    row.className = 'version-row';
    const count = document.createElement('i');
    count.textContent = String(version.actionCount || 0);
    const copy = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = version.label || 'Автоверсия';
    const date = document.createElement('small');
    date.textContent = `${formatDate(version.createdAt)} · ${version.actionCount || 0} действий`;
    copy.append(title, date);
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.dataset.nativePress = '';
    restore.textContent = 'Вернуть';
    restore.addEventListener('click', () => restoreDrawingVersion(version).catch((error) => fail(error)));
    row.append(count, copy, restore);
    return row;
  }));
  elements.versionsEmpty.hidden = versions.length > 0;
  openSheet(elements.versionsSheet);
  runtime.refreshControls(elements.versionsSheet);
}

async function restoreDrawingVersion(version) {
  let target = versionsTargetId === currentDrawing?.id ? currentDrawing : normalizeDrawingDocument(await database.get(versionsTargetId));
  if (!target || version.drawingId !== target.id) throw new Error('Version target is missing');
  if (target.id !== currentDrawing?.id) {
    await showEditor(target);
    target = currentDrawing;
  }
  await createDrawingVersion('До восстановления', true);
  const candidate = {
    ...target,
    ...cloneValue(version.snapshot),
    id: target.id,
    title: target.title,
    createdAt: target.createdAt,
    updatedAt: new Date().toISOString(),
    thumbnail: null,
    versionedAt: new Date().toISOString()
  };
  if (!isValidDrawing(candidate)) throw new Error('Saved version is damaged');
  currentDrawing = candidate;
  undoStack = currentLayers()
    .flatMap((layer) => layer.strokes.map((stroke) => ({ kind: 'stroke', layerId: layer.id, stroke: cloneValue(stroke) })))
    .sort((a, b) => (Number(a.stroke.seq) || 0) - (Number(b.stroke.seq) || 0))
    .slice(-60);
  redoStack = [];
  actionsSinceVersion = 0;
  setSelection(null);
  ensureDocumentSurfaces();
  resetView();
  updateHistoryButtons();
  updateLayerBadge();
  syncToolInterface();
  markDirty();
  closeSheet();
  showToast('Версия восстановлена');
}

async function openTimelapseSheet() {
  timelapseTarget = normalizeDrawingDocument(await resolveTargetDrawing());
  if (!timelapseTarget) throw new Error('Drawing not found');
  const plan = makeTimelapsePlan(timelapseTarget);
  elements.timelapseProgress.hidden = true;
  elements.timelapseProgress.style.setProperty('--progress', '0%');
  $('span', elements.timelapseProgress).textContent = '0%';
  elements.createTimelapseButton.disabled = plan.actionCount === 0;
  elements.createTimelapseButton.textContent = plan.actionCount
    ? 'Собрать и отправить GIF'
    : 'Сначала нарисуй хоть что-нибудь';
  elements.timelapseCopy.textContent = plan.actionCount
    ? `${plan.actionCount} действий превратятся примерно в ${plan.durationSeconds} сек. GIF. Всё кодируется на устройстве.`
    : 'Пустой лист в таймлапсе выглядит как очень концептуальное кино.';
  openSheet(elements.timelapseSheet);
}

async function createTimelapse() {
  if (timelapseBusy || !timelapseTarget) return;
  timelapseBusy = true;
  elements.createTimelapseButton.disabled = true;
  elements.createTimelapseButton.textContent = 'Собираем кадры…';
  elements.timelapseProgress.hidden = false;
  try {
    const result = await encodeTimelapseGif(timelapseTarget, {
      onProgress(progress) {
        const percent = Math.round(progress * 100);
        elements.timelapseProgress.style.setProperty('--progress', `${percent}%`);
        $('span', elements.timelapseProgress).textContent = `${percent}%`;
      }
    });
    const filename = `${safeFileStem(timelapseTarget.title)}-timelapse.gif`;
    const file = new File([result.blob], filename, { type: 'image/gif' });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({ title: `${timelapseTarget.title} — таймлапс`, files: [file] });
    } else {
      downloadBlob(result.blob, filename);
      showToast('Таймлапс GIF сохранён');
    }
    closeSheet();
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.warn('Timelapse export failed', error);
      showToast('Не удалось собрать таймлапс', 'error');
    }
  } finally {
    timelapseBusy = false;
    elements.createTimelapseButton.disabled = false;
    elements.createTimelapseButton.textContent = 'Собрать и отправить GIF';
  }
}

function enterFocusMode() {
  closeSheet();
  elements.editor.classList.add('is-focus');
  elements.focusExit.hidden = false;
  showToast('Весь экран — твой');
}

function leaveFocusMode() {
  elements.editor.classList.remove('is-focus');
  elements.focusExit.hidden = true;
}

function wireInterface() {
  elements.canvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
  elements.canvas.addEventListener('pointermove', handlePointerMove, { passive: false });
  elements.canvas.addEventListener('pointerup', (event) => finishPointer(event, false));
  elements.canvas.addEventListener('pointercancel', (event) => finishPointer(event, true));
  elements.canvas.addEventListener('lostpointercapture', (event) => finishPointer(event, true));

  elements.libraryButton.addEventListener('click', showGallery);
  elements.titleButton.addEventListener('click', () => openRenameSheet().catch((error) => fail(error)));
  elements.undoButton.addEventListener('click', undo);
  elements.redoButton.addEventListener('click', redo);
  elements.layersButton.addEventListener('click', openLayersSheet);
  elements.shareButton.addEventListener('click', () => openActionsSheet());
  elements.toolButton.addEventListener('click', openToolSheet);
  elements.sizeButton.addEventListener('click', openToolSheet);
  elements.colorButton.addEventListener('click', openColorSheet);
  elements.eraserButton.addEventListener('click', () => {
    if (selectedTool() === 'eraser') setTool(preferences.get('previousTool', 'ink'));
    else setTool('eraser');
  });
  elements.zoomReset.addEventListener('click', () => resetView(true));
  elements.dismissHint.addEventListener('click', () => {
    preferences.set('onboarded', true);
    elements.gestureHint.classList.add('is-dismissed');
  });

  for (const button of $$('[data-tool]', elements.toolGrid)) {
    button.addEventListener('click', () => setTool(button.dataset.tool));
  }
  elements.sizeRange.addEventListener('input', () => setSize(elements.sizeRange.value));
  elements.customColor.addEventListener('input', () => rememberColor(elements.customColor.value));

  elements.selectionShrink.addEventListener('click', () => transformSelectionOnce({ scale: 0.84 }));
  elements.selectionGrow.addEventListener('click', () => transformSelectionOnce({ scale: 1.18 }));
  elements.selectionRotate.addEventListener('click', () => transformSelectionOnce({ rotation: Math.PI / 12 }));
  elements.selectionCopy.addEventListener('click', copySelection);
  elements.selectionDelete.addEventListener('click', deleteSelection);
  elements.selectionDone.addEventListener('click', () => setSelection(null));

  elements.sheetBackdrop.addEventListener('click', closeSheet);
  for (const button of $$('[data-close-sheet]')) button.addEventListener('click', closeSheet);
  elements.saveTitleButton.addEventListener('click', () => saveTitle().catch((error) => fail(error)));
  elements.titleInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveTitle().catch((error) => fail(error));
    }
  });

  elements.copyAction.addEventListener('click', withExportBusy(copyTarget));
  elements.nativeShareAction.addEventListener('click', withExportBusy(shareTarget));
  elements.downloadAction.addEventListener('click', withExportBusy(downloadTarget));
  elements.timelapseAction.addEventListener('click', () => openTimelapseSheet().catch((error) => fail(error)));
  elements.duplicateAction.addEventListener('click', withExportBusy(duplicateTarget));
  elements.focusAction.addEventListener('click', enterFocusMode);
  elements.versionsAction.addEventListener('click', () => openVersionsSheet().catch((error) => fail(error)));
  elements.renameAction.addEventListener('click', () => openRenameSheet(actionsTargetId).catch((error) => fail(error)));
  elements.clearAction.addEventListener('click', () => {
    const isActive = actionsTargetId === currentDrawing?.id && !elements.editor.hidden;
    if (isActive) clearCurrentDrawing();
    else deleteDrawing(actionsTargetId).catch((error) => fail(error));
  });
  elements.focusExit.addEventListener('click', leaveFocusMode);

  elements.createSheetMode.addEventListener('click', () => createNewDrawing('sheet'));
  elements.createInfiniteMode.addEventListener('click', () => createNewDrawing('infinite'));
  elements.addLayerButton.addEventListener('click', addLayer);
  elements.layerDown.addEventListener('click', () => moveActiveLayer(-1));
  elements.layerUp.addEventListener('click', () => moveActiveLayer(1));
  elements.layerMerge.addEventListener('click', mergeActiveLayerDown);
  elements.layerDelete.addEventListener('click', deleteActiveLayer);
  const rememberLayerOpacity = () => {
    layerOpacityBefore ||= cloneLayers();
  };
  elements.layerOpacity.addEventListener('pointerdown', rememberLayerOpacity);
  elements.layerOpacity.addEventListener('focus', rememberLayerOpacity);
  elements.layerOpacity.addEventListener('input', () => {
    const layer = activeLayer();
    if (!layer) return;
    layer.opacity = clamp(Number(elements.layerOpacity.value) / 100, 0, 1);
    elements.layerOpacityValue.value = `${Math.round(layer.opacity * 100)}%`;
    elements.layerOpacityValue.textContent = `${Math.round(layer.opacity * 100)}%`;
    rebuildComposite();
    scheduleRender();
  });
  elements.layerOpacity.addEventListener('change', () => {
    if (!layerOpacityBefore) return;
    pushHistory({ kind: 'layers', before: layerOpacityBefore, after: cloneLayers() });
    layerOpacityBefore = null;
    renderLayerList();
    markDirty();
    noteDrawingAction();
  });
  elements.createTimelapseButton.addEventListener('click', createTimelapse);

  elements.cancelConfirm.addEventListener('click', closeSheet);
  elements.acceptConfirm.addEventListener('click', async () => {
    const callback = confirmCallback;
    confirmCallback = null;
    try {
      await callback?.();
    } catch (error) {
      console.warn(error);
      closeSheet();
      showToast('Не получилось выполнить действие', 'error');
    }
  });

  elements.newDrawingButton.addEventListener('click', openNewDrawingSheet);
  elements.emptyNewButton.addEventListener('click', openNewDrawingSheet);
  elements.reloadButton.addEventListener('click', () => location.reload());

  window.addEventListener('resize', resizeDisplayCanvas, { passive: true });
  window.addEventListener('appviewportchange', resizeDisplayCanvas, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      cancelStroke();
      createDrawingVersion('Перед паузой');
      queueSave(false);
    }
  });
  window.addEventListener('pagehide', () => queueSave(false));
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!elements.sheetLayer.hidden) closeSheet();
      else if (elements.editor.classList.contains('is-focus')) leaveFocusMode();
      else if (!elements.gallery.hidden && currentDrawing) showEditor(currentDrawing);
      return;
    }
    if (!(event.ctrlKey || event.metaKey) || event.target.matches('input, textarea')) return;
    if (event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    }
  });
}

async function start() {
  wireInterface();
  renderColorGrid();
  renderPaperColors();
  syncToolInterface();
  syncColorInterface();

  try {
    database = await openDrawingDatabase(STORAGE_NAMESPACE);
    createWorkshopMode({
      appName: APP_NAME,
      version: APP_VERSION,
      cachePrefix: 'mazok-',
      storageNamespace: STORAGE_NAMESPACE,
      async onReset() {
        preferences.reset();
        await database.clear();
        location.reload();
      }
    });

    watchConnectivity((online) => {
      document.documentElement.dataset.network = online ? 'online' : 'offline';
    });

    if (preferences.get('onboarded', false)) elements.gestureHint.classList.add('is-dismissed');
    await showGallery();
  } catch (error) {
    fail(error);
  }
}

start();

export const testHooks = {
  getCurrentDrawing: () => currentDrawing,
  getView: () => ({ ...view }),
  resetView,
  showGallery,
  createNewDrawing,
  deleteDrawing
};
