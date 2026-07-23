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
  createDrawingDocument,
  distance,
  drawStrokeRange,
  drawingCountLabel,
  fitDrawingScale,
  floodFillContext,
  isValidDrawing,
  makeId,
  normalizeHexColor,
  replayStrokes,
  replayStrokesScaled,
  safeFileStem,
  simplifyPoints
} from './drawing-core.js';
import { openDrawingDatabase } from './drawing-db.js';

const APP_NAME = 'МАЗОК';
const APP_VERSION = '1.2.0';
const STORAGE_NAMESPACE = 'pocket-works:mazok';
const THUMBNAIL_RENDER_VERSION = 3;
const FILL_TOLERANCE = 18;
const FILL_EDGE_TOLERANCE = 148;
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
  shareButton: $('#shareButton'),
  gestureHint: $('#gestureHint'),
  dismissHint: $('#dismissHint'),
  zoomReset: $('#zoomReset'),
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
  customColor: $('#customColor'),
  paperColors: $('#paperColors'),
  actionsSheet: $('#actionsSheet'),
  actionsKicker: $('#actionsKicker'),
  actionsSheetTitle: $('#actionsSheetTitle'),
  copyAction: $('#copyAction'),
  nativeShareAction: $('#nativeShareAction'),
  downloadAction: $('#downloadAction'),
  focusAction: $('#focusAction'),
  renameAction: $('#renameAction'),
  duplicateAction: $('#duplicateAction'),
  clearAction: $('#clearAction'),
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
    sizes: { pencil: 8, ink: 14, marker: 38, fill: 1, eraser: 34 },
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
let strokeCanvas = null;
let strokeContext = null;
let eraserBackup = null;
let currentStroke = null;
let renderedPointCount = 0;
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
  const current = selectedTool();
  const patch = { tool };
  if (tool !== 'eraser') patch.previousTool = tool;
  else if (current !== 'eraser') patch.previousTool = current;
  preferences.patch(patch);
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
  elements.toolIcon.setAttribute('href', `#${definition.icon}`);
  elements.toolName.textContent = definition.label;
  elements.eraserButton.classList.toggle('is-active', tool === 'eraser');
  elements.toolButton.classList.toggle('is-eraser', tool === 'eraser');
  elements.toolButton.classList.toggle('is-fill', isFill);
  elements.thumbPalette.classList.toggle('is-fill', isFill);
  elements.sizeButton.hidden = isFill;
  elements.sizeControl.hidden = isFill;
  for (const button of $$('[data-tool]', elements.toolGrid)) {
    const active = button.dataset.tool === tool;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
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

function renderPaperColors() {
  elements.paperColors.replaceChildren();
  for (const color of PAPER_COLORS) {
    const button = makeColorButton(color, 'paper-color', () => {
      if (!currentDrawing) return;
      currentDrawing.background = color;
      preferences.set('paper', color);
      renderPaperColors();
      scheduleRender();
      restartAnimation(elements.canvas, 'is-paper-changing', 340);
      markDirty();
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
  for (const button of $$('[data-color]', elements.colorGrid)) {
    const active = button.dataset.color.toLowerCase() === color;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

function updateHistoryButtons() {
  elements.undoButton.disabled = !currentDrawing?.strokes?.length;
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

function ensureDocumentSurfaces() {
  if (!currentDrawing) return;
  releaseCanvas(documentCanvas);
  releaseCanvas(strokeCanvas);
  releaseCanvas(eraserBackup);
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
  replayStrokes(documentContext, currentDrawing.strokes, currentDrawing.width, currentDrawing.height, currentDrawing.background);
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
    view.fitScale = fitDrawingScale(
      rect.width,
      rect.height,
      currentDrawing.width,
      currentDrawing.height
    );
    clampView();
  }
  scheduleRender();
}

function clampView() {
  if (!currentDrawing) return;
  view.zoom = clamp(view.zoom, 1, 6);
  const scale = currentDocumentScale();
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
  return point.x >= -margin && point.y >= -margin
    && point.x <= currentDrawing.width + margin
    && point.y <= currentDrawing.height + margin;
}

function scheduleRender() {
  if (renderFrame) return;
  renderFrame = requestAnimationFrame(renderDisplay);
}

function renderDisplay() {
  renderFrame = 0;
  const context = elements.canvas.getContext('2d', { alpha: false, desynchronized: true });
  const { width, height, dpr } = displayBox;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#d8d0c3';
  context.fillRect(0, 0, width, height);
  if (!currentDrawing || !documentCanvas) return;

  const scale = currentDocumentScale();
  const originX = width * 0.5 + view.panX - currentDrawing.width * scale * 0.5;
  const originY = height * 0.5 + view.panY - currentDrawing.height * scale * 0.5;

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
  context.drawImage(documentCanvas, 0, 0);
  if (currentStroke && currentStroke.tool !== 'eraser' && currentStroke.tool !== 'fill') {
    context.save();
    context.globalAlpha = TOOL_DEFS[currentStroke.tool].opacity;
    context.drawImage(strokeCanvas, 0, 0);
    context.restore();
  }
  context.lineWidth = 1 / scale;
  context.strokeStyle = 'rgba(50, 45, 38, .14)';
  context.strokeRect(0, 0, currentDrawing.width, currentDrawing.height);
  context.restore();

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
  return {
    x: clamp(smoothed.x, 0, currentDrawing.width),
    y: clamp(smoothed.y, 0, currentDrawing.height),
    p: event.pressure > 0 ? clamp(event.pressure, 0.05, 1) : 0.5,
    t: Math.max(0, Math.round(event.timeStamp || performance.now()))
  };
}

function clearStrokeSurface() {
  if (!strokeContext || !strokeCanvas) return;
  strokeContext.setTransform(1, 0, 0, 1, 0, 0);
  strokeContext.clearRect(0, 0, strokeCanvas.width, strokeCanvas.height);
}

function beginStroke(event) {
  if (!currentDrawing || suppressDrawingUntilClear) return;
  const documentPoint = screenToDocument(event.clientX, event.clientY);
  if (!pointInsideDocument(documentPoint)) return;
  const tool = selectedTool();
  const point = pointerSample(event);
  currentStroke = {
    id: makeId('stroke'),
    tool,
    color: selectedColor(),
    size: tool === 'fill' ? 1 : brushSizeInDocument(selectedSize(tool), currentDrawing.width),
    tolerance: tool === 'fill' ? FILL_TOLERANCE : undefined,
    edgeTolerance: tool === 'fill' ? FILL_EDGE_TOLERANCE : undefined,
    seed: Math.floor(Math.random() * 0xffffffff),
    points: [point]
  };
  renderedPointCount = 0;
  clearStrokeSurface();
  if (tool === 'eraser') {
    eraserBackup = document.createElement('canvas');
    eraserBackup.width = currentDrawing.width;
    eraserBackup.height = currentDrawing.height;
    eraserBackup.getContext('2d').drawImage(documentCanvas, 0, 0);
    drawStrokeRange(documentContext, currentStroke, 0);
  } else {
    const opacity = TOOL_DEFS[tool].opacity < 1 ? 1 : TOOL_DEFS[tool].opacity;
    drawStrokeRange(strokeContext, currentStroke, 0, { opacity });
  }
  renderedPointCount = 1;
  elements.editor.classList.add('is-drawing');
  scheduleRender();
}

function appendPointerEvent(event, isFinal = false) {
  if (!currentStroke) return;
  const raw = screenToDocument(event.clientX, event.clientY);
  if (!pointInsideDocument(raw, currentStroke.size * 1.5)) return;
  const point = pointerSample(event, isFinal);
  if (currentStroke.tool === 'fill') {
    currentStroke.points[0] = point;
    return;
  }
  const previous = currentStroke.points.at(-1);
  if (!isFinal && distance(point, previous) < Math.max(0.35, currentStroke.size * 0.025)) return;
  currentStroke.points.push(point);
  const start = renderedPointCount;
  if (currentStroke.tool === 'eraser') {
    drawStrokeRange(documentContext, currentStroke, start);
  } else {
    const opacity = TOOL_DEFS[currentStroke.tool].opacity < 1 ? 1 : TOOL_DEFS[currentStroke.tool].opacity;
    drawStrokeRange(strokeContext, currentStroke, start, { opacity });
  }
  renderedPointCount = currentStroke.points.length;
}

function moveStroke(event) {
  const samples = event.getCoalescedEvents?.() || [event];
  for (const sample of samples) appendPointerEvent(sample);
  scheduleRender();
}

function commitCurrentAction(stroke) {
  currentDrawing.strokes.push(stroke);
  redoStack = [];
  currentStroke = null;
  eraserBackup = null;
  clearStrokeSurface();
  elements.editor.classList.remove('is-drawing');
  preferences.set('onboarded', true);
  elements.gestureHint.classList.add('is-dismissed');
  updateHistoryButtons();
  markDirty();
  requestPersistentStorage();
  scheduleRender();
}

function finishStroke(event) {
  if (!currentStroke) return;
  appendPointerEvent(event, true);
  const stroke = currentStroke;

  if (stroke.tool === 'fill') {
    let changed = 0;
    try {
      changed = floodFillContext(
        documentContext,
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
    commitCurrentAction(stroke);
    return;
  }

  const tolerance = Math.max(0.45, stroke.size * 0.018);
  stroke.points = simplifyPoints(stroke.points, tolerance);

  if (stroke.tool !== 'eraser') {
    documentContext.save();
    documentContext.globalAlpha = TOOL_DEFS[stroke.tool].opacity;
    documentContext.drawImage(strokeCanvas, 0, 0);
    documentContext.restore();
  }

  commitCurrentAction(stroke);
}

function cancelStroke() {
  if (!currentStroke) return;
  if (currentStroke.tool === 'eraser' && eraserBackup) {
    documentContext.clearRect(0, 0, currentDrawing.width, currentDrawing.height);
    documentContext.drawImage(eraserBackup, 0, 0);
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
  cancelStroke();
  suppressDrawingUntilClear = true;
  const [a, b] = pinchPair();
  if (!a || !b) return;
  const center = { x: (a.clientX + b.clientX) * 0.5, y: (a.clientY + b.clientY) * 0.5 };
  const documentPoint = screenToDocument(center.x, center.y);
  pinch = {
    distance: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)),
    zoom: view.zoom,
    documentPoint
  };
}

function movePinch() {
  const [a, b] = pinchPair();
  if (!pinch || !a || !b) return;
  const currentDistance = Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY));
  const center = { x: (a.clientX + b.clientX) * 0.5, y: (a.clientY + b.clientY) * 0.5 };
  const rect = elements.canvas.getBoundingClientRect();
  view.zoom = clamp(pinch.zoom * (currentDistance / pinch.distance), 1, 6);
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
  else if (currentStroke) moveStroke(event);
}

function finishPointer(event, cancelled = false) {
  if (!pointers.has(event.pointerId)) return;
  const wasPinching = Boolean(pinch || suppressDrawingUntilClear);
  pointers.delete(event.pointerId);
  releasePointer(elements.canvas, event.pointerId);
  if (wasPinching) {
    cancelStroke();
    if (pointers.size === 0) {
      pinch = null;
      suppressDrawingUntilClear = false;
    }
    return;
  }
  if (cancelled) cancelStroke();
  else finishStroke(event);
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
  if (!currentDrawing || !documentContext) return;
  replayStrokes(documentContext, currentDrawing.strokes, currentDrawing.width, currentDrawing.height, currentDrawing.background);
  scheduleRender();
}

function undo() {
  if (!currentDrawing?.strokes.length || currentStroke) return;
  redoStack.push(currentDrawing.strokes.pop());
  rebuildDocument();
  updateHistoryButtons();
  markDirty();
  restartAnimation(elements.canvas, 'is-history-changing', 240);
}

function redo() {
  if (!redoStack.length || currentStroke) return;
  currentDrawing.strokes.push(redoStack.pop());
  rebuildDocument();
  updateHistoryButtons();
  markDirty();
  restartAnimation(elements.canvas, 'is-history-changing', 240);
}

function makeSnapshot(drawing = currentDrawing) {
  const snapshot = cloneValue(drawing);
  snapshot.updatedAt = new Date().toISOString();
  return snapshot;
}

function renderDrawingToCanvas(drawing, maximumWidth = drawing.width) {
  const scale = Math.min(1, maximumWidth / drawing.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(drawing.width * scale));
  canvas.height = Math.max(1, Math.round(drawing.height * scale));
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = drawing.background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (drawing.id === currentDrawing?.id && documentCanvas) {
    context.drawImage(documentCanvas, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  const paint = document.createElement('canvas');
  paint.width = canvas.width;
  paint.height = canvas.height;
  const paintContext = paint.getContext('2d', { alpha: true });
  replayStrokesScaled(
    paintContext,
    drawing.strokes,
    drawing.width,
    drawing.height,
    paint.width,
    paint.height,
    drawing.background
  );
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
  await saveNow();
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
  if (!isValidDrawing(drawing)) throw new Error('Drawing data is damaged');
  const canReuseSurface = Boolean(
    documentCanvas
    && currentDrawing?.id === drawing.id
    && currentDrawing.updatedAt === drawing.updatedAt
    && currentDrawing.strokes.length === drawing.strokes.length
  );
  currentDrawing = drawing;
  redoStack = [];
  saveRevision = 0;
  savedRevision = 0;
  preferences.set('activeDrawingId', drawing.id);
  if (!canReuseSurface) ensureDocumentSurfaces();
  resetView();
  elements.documentTitle.textContent = drawing.title || 'Без названия';
  setSaveStatus('Сохранено', 'saved');
  updateHistoryButtons();
  renderPaperColors();
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

async function createNewDrawing() {
  try {
    await saveNow();
    const viewport = runtime.getViewportState();
    const drawing = createDrawingDocument(viewport.width, viewport.height, { background: preferences.get('paper', PAPER_COLORS[0]) });
    await database.put(drawing);
    requestPersistentStorage();
    await showEditor(drawing);
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
  if (!currentDrawing?.strokes.length) {
    closeSheet();
    showToast('Лист и так чистый');
    return;
  }
  openConfirm({
    title: 'Очистить весь лист?',
    copy: 'Все мазки исчезнут. Это действие нельзя отменить.',
    acceptLabel: 'Очистить',
    onAccept() {
      currentDrawing.strokes = [];
      redoStack = [];
      rebuildDocument();
      updateHistoryButtons();
      markDirty();
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
  elements.duplicateAction.addEventListener('click', withExportBusy(duplicateTarget));
  elements.focusAction.addEventListener('click', enterFocusMode);
  elements.renameAction.addEventListener('click', () => openRenameSheet(actionsTargetId).catch((error) => fail(error)));
  elements.clearAction.addEventListener('click', () => {
    const isActive = actionsTargetId === currentDrawing?.id && !elements.editor.hidden;
    if (isActive) clearCurrentDrawing();
    else deleteDrawing(actionsTargetId).catch((error) => fail(error));
  });
  elements.focusExit.addEventListener('click', leaveFocusMode);

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

  elements.newDrawingButton.addEventListener('click', createNewDrawing);
  elements.emptyNewButton.addEventListener('click', createNewDrawing);
  elements.reloadButton.addEventListener('click', () => location.reload());

  window.addEventListener('resize', resizeDisplayCanvas, { passive: true });
  window.addEventListener('appviewportchange', resizeDisplayCanvas, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      cancelStroke();
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
