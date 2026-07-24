import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  blendshapeMap,
  boundingBoxFromLandmarks,
  combineAssessments,
  computeGeometryProfile,
  computeImageQuality,
  createScanAssessment,
  qualityGate,
  ratingLabel
} from './analysis-engine.js';

installMobileRuntime();

const APP_VERSION = '1.2.0';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODULES = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/+esm',
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs'
];
const MAX_SCANS = 3;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const el = Object.fromEntries(Object.entries({
  consent: 'consent-check', capture: 'capture-panel', captureHint: 'capture-hint', cameraOpen: 'camera-open',
  file: 'file-input', upload: 'upload-label', stage: 'photo-stage', empty: 'empty-photo', image: 'source-image',
  overlay: 'overlay-canvas', replace: 'replace-photo', analyze: 'analyze-button', analyzeLabel: 'analyze-label',
  model: 'model-status', quality: 'quality-row', progress: 'scan-progress', counter: 'scan-counter', result: 'result-panel',
  resultMode: 'result-mode', score: 'score-value', range: 'score-range', label: 'score-label', reliability: 'reliability-value',
  consistency: 'consistency-value', typicality: 'typicality-value', occlusion: 'occlusion-value', stabilityNote: 'stability-note',
  metrics: 'metric-list', featureDetails: 'feature-detail-list', issues: 'issue-list', add: 'add-scan', finish: 'finish-session',
  reset: 'reset-session', share: 'share-result', method: 'method-open', methodDialog: 'method-dialog', history: 'history-open',
  historyDialog: 'history-dialog', historyList: 'history-list', historyClear: 'history-clear', cameraDialog: 'camera-dialog',
  cameraClose: 'camera-close', video: 'camera-video', cameraGuide: 'camera-guide', cameraMessage: 'camera-message',
  shutter: 'camera-capture', cameraFlip: 'camera-flip', work: 'work-canvas', toast: 'toast'
}).map(([key, id]) => [key, document.getElementById(id)]));

const store = createVersionedStore({
  namespace: 'pocket-works:facet-face-lab',
  version: 3,
  defaults: { consented: false, history: [], haptics: true },
  migrations: {
    1: (data) => ({ consented: Boolean(data?.consented), history: [], haptics: data?.haptics !== false }),
    2: (data) => ({ consented: Boolean(data?.consented), history: Array.isArray(data?.history) ? data.history : [], haptics: data?.haptics !== false })
  },
  validate: (value) => Boolean(value && typeof value === 'object' && Array.isArray(value.history))
});

let online = navigator.onLine;
let landmarker = null;
let modelPromise = null;
let imageUrl = null;
let landmarks = null;
let currentQuality = null;
let cameraStream = null;
let cameraFacing = 'user';
let scans = [];
let hashes = [];
let combined = null;
let finalized = false;
let resultSaved = false;
let toastTimer = 0;

createWorkshopMode({
  appName: 'FACET',
  version: APP_VERSION,
  cachePrefix: 'facet-face-lab-',
  storageNamespace: 'pocket-works:facet-face-lab',
  onReset: () => { store.reset(); resetAll(); setConsent(false); renderHistory(); }
});

watchConnectivity((value) => {
  online = value;
  document.documentElement.dataset.network = value ? 'online' : 'offline';
  if (!landmarker) setModel(value ? 'idle' : 'error', value ? 'модель не загружена' : 'нужна сеть');
});

function vibrate(pattern = 10) { if (store.get('haptics', true) && navigator.vibrate) navigator.vibrate(pattern); }
function toast(message, time = 3600) {
  clearTimeout(toastTimer);
  el.toast.textContent = message;
  el.toast.classList.add('is-visible');
  toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), time);
}
function setModel(state, text) { el.model.dataset.status = state; $('span', el.model).textContent = text; }
function openDialog(dialog) { dialog.showModal ? (!dialog.open && dialog.showModal()) : dialog.setAttribute('open', ''); }
function closeDialog(dialog) { dialog.close && dialog.open ? dialog.close() : dialog.removeAttribute('open'); }
function setConsent(value) {
  el.consent.checked = value;
  el.capture.classList.toggle('is-locked', !value);
  el.cameraOpen.disabled = !value;
  el.file.disabled = !value;
  el.upload.setAttribute('aria-disabled', String(!value));
}
function loading(value, label = 'Анализировать') {
  el.analyze.disabled = value || !el.image.src;
  el.analyze.classList.toggle('is-loading', value);
  el.analyzeLabel.textContent = value ? label : 'Анализировать';
  el.stage.dataset.state = value ? 'scanning' : landmarks ? 'analyzed' : el.image.src ? 'ready' : 'empty';
}
function timeout(promise, ms, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })])
    .finally(() => clearTimeout(timer));
}

async function getModel() {
  if (landmarker) return landmarker;
  if (modelPromise) return modelPromise;
  if (!online) throw new Error('Первый запуск требует интернет');
  setModel('loading', 'загрузка модели');
  modelPromise = (async () => {
    let visionModule;
    let lastError;
    for (const url of MODULES) {
      try {
        const candidate = await timeout(import(url), 22000, 'Не удалось загрузить библиотеку');
        if (candidate.FaceLandmarker && candidate.FilesetResolver) { visionModule = candidate; break; }
      } catch (error) { lastError = error; }
    }
    if (!visionModule) throw lastError || new Error('MediaPipe недоступен');
    const vision = await timeout(visionModule.FilesetResolver.forVisionTasks(WASM), 26000, 'Ошибка вычислительного ядра');
    landmarker = await timeout(visionModule.FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
      runningMode: 'IMAGE',
      numFaces: 2,
      minFaceDetectionConfidence: .72,
      minFacePresenceConfidence: .72,
      minTrackingConfidence: .72,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true
    }), 42000, 'Модель загружается слишком долго');
    setModel('ready', 'готова');
    return landmarker;
  })().catch((error) => { landmarker = null; modelPromise = null; setModel('error', 'ошибка'); throw error; });
  return modelPromise;
}

function clearOverlay() { el.overlay.getContext('2d').clearRect(0, 0, el.overlay.width, el.overlay.height); }
function resetPhoto() {
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = null;
  landmarks = null;
  currentQuality = null;
  el.image.removeAttribute('src');
  el.image.hidden = true;
  el.empty.hidden = false;
  el.replace.hidden = true;
  el.analyze.disabled = true;
  el.stage.dataset.state = 'empty';
  el.quality.hidden = true;
  el.file.value = '';
  clearOverlay();
}
function resetAll() {
  scans = [];
  hashes = [];
  combined = null;
  finalized = false;
  resultSaved = false;
  el.result.hidden = true;
  resetPhoto();
  renderProgress();
}
function renderProgress() {
  const count = scans.length;
  el.counter.textContent = count === 0 ? '0/1' : `${count} ${count === 1 ? 'кадр' : 'кадра'}`;
  el.captureHint.textContent = count === 0
    ? 'Нужен один фронтальный кадр. Волосы не должны закрывать лоб, глаза и контур лица.'
    : count < MAX_SCANS
      ? 'Результат уже готов. Следующий кадр необязателен и нужен только для проверки повторяемости.'
      : 'Проверка завершена по трём кадрам.';
  $$('.scan-dot', el.progress).forEach((dot, index) => {
    dot.classList.toggle('is-done', index < count);
    dot.classList.toggle('is-current', index === count && count < MAX_SCANS);
  });
}

function drawToCanvas(max = 1100) {
  const scale = Math.min(1, max / Math.max(el.image.naturalWidth, el.image.naturalHeight));
  el.work.width = Math.max(1, Math.round(el.image.naturalWidth * scale));
  el.work.height = Math.max(1, Math.round(el.image.naturalHeight * scale));
  const context = el.work.getContext('2d', { willReadFrequently: true });
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, el.work.width, el.work.height);
  context.drawImage(el.image, 0, 0, el.work.width, el.work.height);
  return context;
}
function mirrorCanvas(source) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d');
  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.drawImage(source, 0, 0);
  return canvas;
}
function imageHash(source) {
  const canvas = document.createElement('canvas');
  canvas.width = 9;
  canvas.height = 8;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0, 9, 8);
  const data = context.getImageData(0, 0, 9, 8).data;
  const gray = (i) => data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722;
  let result = '';
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) {
    const left = (y * 9 + x) * 4;
    result += gray(left) < gray(left + 4) ? '1' : '0';
  }
  return result;
}
function hashDistance(a, b) {
  let total = Math.abs(a.length - b.length);
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) total += a[i] !== b[i];
  return total;
}
function chip(label, value, state = 'good') {
  const node = document.createElement('div');
  node.className = 'quality-chip';
  node.dataset.state = state;
  const name = document.createElement('span');
  name.textContent = label;
  const score = document.createElement('strong');
  score.textContent = value;
  node.append(name, score);
  return node;
}
function basicQuality() {
  const context = drawToCanvas(720);
  const data = context.getImageData(0, 0, el.work.width, el.work.height).data;
  const step = Math.max(4, Math.floor(data.length / 150000) * 4);
  let n = 0;
  let sum = 0;
  let squares = 0;
  for (let i = 0; i < data.length; i += step) {
    const g = data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722;
    n += 1;
    sum += g;
    squares += g * g;
  }
  const light = sum / Math.max(1, n);
  const contrast = Math.sqrt(Math.max(0, squares / Math.max(1, n) - light * light));
  const resolution = Math.min(el.image.naturalWidth, el.image.naturalHeight);
  el.quality.hidden = false;
  el.quality.replaceChildren(
    chip('Размер', resolution >= 720 ? 'хороший' : resolution >= 480 ? 'допустимый' : 'низкий', resolution >= 480 ? 'good' : 'warn'),
    chip('Свет', light > 48 && light < 215 ? 'норма' : 'проверь', light > 42 && light < 225 ? 'good' : 'warn'),
    chip('Контраст', contrast > 24 ? 'норма' : 'низкий', contrast > 20 ? 'good' : 'warn'),
    chip('Лицо', 'ещё не проверено', 'neutral')
  );
}
async function loadPhoto(file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) return toast('Максимальный размер фото — 20 МБ.');
  if (file.type && !file.type.startsWith('image/')) return toast('Нужен файл изображения.');
  resetPhoto();
  imageUrl = URL.createObjectURL(file);
  el.image.src = imageUrl;
  try {
    if (el.image.decode) await el.image.decode();
    else await new Promise((resolve, reject) => { el.image.onload = resolve; el.image.onerror = reject; });
    el.image.hidden = false;
    el.empty.hidden = true;
    el.replace.hidden = false;
    el.stage.dataset.state = 'ready';
    el.analyze.disabled = false;
    basicQuality();
    vibrate();
  } catch {
    resetPhoto();
    toast('Не удалось прочитать фото. Попробуй JPEG или PNG.');
  }
}

const MESH_PATHS = [
  [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10],
  [33,160,158,133,153,144,33], [263,387,385,362,380,373,263],
  [70,63,105,66,107], [300,293,334,296,336],
  [168,6,197,195,5,4,1,2,98,97,2,326,327],
  [61,146,91,181,84,17,314,405,321,375,291,308,324,318,402,317,14,87,178,88,95,78,61]
];
function imagePlacement() {
  const rect = el.stage.getBoundingClientRect();
  const imageRatio = el.image.naturalWidth / el.image.naturalHeight;
  const stageRatio = rect.width / rect.height;
  let shownWidth;
  let shownHeight;
  if (imageRatio > stageRatio) {
    shownWidth = rect.width;
    shownHeight = rect.width / imageRatio;
  } else {
    shownHeight = rect.height;
    shownWidth = rect.height * imageRatio;
  }
  return { rect, shownWidth, shownHeight, offsetX: (rect.width - shownWidth) / 2, offsetY: (rect.height - shownHeight) / 2 };
}
function drawOverlay() {
  clearOverlay();
  if (!landmarks || el.image.hidden) return;
  const { rect, shownWidth, shownHeight, offsetX, offsetY } = imagePlacement();
  if (!rect.width) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  el.overlay.width = rect.width * dpr;
  el.overlay.height = rect.height * dpr;
  const context = el.overlay.getContext('2d');
  context.scale(dpr, dpr);
  const point = (index) => ({ x: offsetX + landmarks[index].x * shownWidth, y: offsetY + landmarks[index].y * shownHeight });
  context.lineWidth = 1.15;
  context.strokeStyle = 'rgba(32,79,116,.75)';
  for (const path of MESH_PATHS) {
    context.beginPath();
    path.forEach((index, position) => {
      const p = point(index);
      if (position === 0) context.moveTo(p.x, p.y);
      else context.lineTo(p.x, p.y);
    });
    context.stroke();
  }
  if (currentQuality?.raw?.occlusionRisk > 45) {
    context.strokeStyle = 'rgba(201,151,53,.95)';
    context.lineWidth = 2;
    const upper = [127,162,21,54,103,67,109,10,338,297,332,284,251,389,356];
    context.beginPath();
    upper.forEach((index, position) => {
      const p = point(index);
      if (position === 0) context.moveTo(p.x, p.y);
      else context.lineTo(p.x, p.y);
    });
    context.stroke();
  }
}

function drawCameraGuide() {
  const rect = el.cameraGuide.getBoundingClientRect();
  if (!rect.width) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  el.cameraGuide.width = rect.width * dpr;
  el.cameraGuide.height = rect.height * dpr;
  const context = el.cameraGuide.getContext('2d');
  context.scale(dpr, dpr);
  context.clearRect(0, 0, rect.width, rect.height);
  const cx = rect.width / 2;
  const cy = rect.height * .46;
  const rx = Math.min(rect.width * .25, rect.height * .19);
  const ry = rx * 1.33;
  context.strokeStyle = 'rgba(255,255,255,.86)';
  context.lineWidth = 1.5;
  context.setLineDash([9, 7]);
  context.beginPath();
  context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);
  context.strokeStyle = 'rgba(235,185,72,.92)';
  context.beginPath();
  context.moveTo(cx - rx * 1.2, cy - ry * .16);
  context.lineTo(cx + rx * 1.2, cy - ry * .16);
  context.stroke();
}
async function resetTrackZoom(track) {
  try {
    const capabilities = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
    if (!capabilities.zoom || typeof track.applyConstraints !== 'function') return;
    const min = Number(capabilities.zoom.min ?? 1);
    const max = Number(capabilities.zoom.max ?? min);
    const target = Math.max(min, Math.min(max, 1));
    await track.applyConstraints({ advanced: [{ zoom: target }] });
  } catch (error) {
    console.warn('Camera zoom reset is unavailable', error);
  }
}
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) return toast('Камера недоступна. Выбери фото из галереи.');
  openDialog(el.cameraDialog);
  stopCamera();
  el.shutter.disabled = true;
  el.cameraMessage.textContent = 'Запрашиваю доступ…';
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: cameraFacing }, resizeMode: 'none' }
    });
    const track = cameraStream.getVideoTracks()[0];
    if (track) await resetTrackZoom(track);
    el.video.srcObject = cameraStream;
    await el.video.play();
    el.video.style.transform = cameraFacing === 'user' ? 'scaleX(-1)' : 'none';
    el.shutter.disabled = false;
    el.cameraMessage.textContent = 'Отодвинь телефон: волосы, подбородок и плечи должны быть видны';
    requestAnimationFrame(drawCameraGuide);
  } catch (error) {
    console.error('Camera start failed', error);
    el.cameraMessage.textContent = 'Нет доступа к камере';
  }
}
function stopCamera() {
  if (cameraStream) for (const track of cameraStream.getTracks()) track.stop();
  cameraStream = null;
  el.video.srcObject = null;
}
async function takePhoto() {
  if (!cameraStream || !el.video.videoWidth) return;
  const scale = Math.min(1, 1600 / Math.max(el.video.videoWidth, el.video.videoHeight));
  el.work.width = Math.round(el.video.videoWidth * scale);
  el.work.height = Math.round(el.video.videoHeight * scale);
  const context = el.work.getContext('2d');
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, el.work.width, el.work.height);
  if (cameraFacing === 'user') {
    context.translate(el.work.width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(el.video, 0, 0, el.work.width, el.work.height);
  const blob = await new Promise((resolve) => el.work.toBlob(resolve, 'image/jpeg', .92));
  stopCamera();
  closeDialog(el.cameraDialog);
  if (blob) await loadPhoto(blob);
}

function fail(message, detail = '') { toast(detail ? `${message}. ${detail}` : message, 4600); vibrate([18, 35, 18]); }
function renderQuality(quality) {
  const visibility = Math.round(quality.metrics.occlusion);
  el.quality.hidden = false;
  el.quality.replaceChildren(
    chip('Резкость', String(Math.round(quality.metrics.sharpness)), quality.metrics.sharpness >= 72 ? 'good' : 'warn'),
    chip('Фронтальность', String(Math.round(quality.metrics.frontal)), quality.metrics.frontal >= 72 ? 'good' : 'warn'),
    chip('Видимость', String(visibility), visibility >= 68 ? 'good' : 'warn'),
    chip('Надёжность', String(Math.round(quality.reliability)), quality.reliability >= 68 ? 'good' : 'warn')
  );
}
async function analyze() {
  if (!el.image.src || finalized) return;
  loading(true, 'Подготовка…');
  landmarks = null;
  currentQuality = null;
  clearOverlay();
  try {
    const model = await getModel();
    const context = drawToCanvas();
    const hash = imageHash(el.work);
    if (hashes.some((known) => hashDistance(hash, known) < 7)) return fail('Этот кадр почти совпадает с предыдущим', 'Измени дистанцию или свет и пересними.');
    loading(true, 'Проверка лица…');
    await new Promise(requestAnimationFrame);
    const result = model.detect(el.work);
    const faces = result.faceLandmarks || [];
    if (!faces.length) return fail('Лицо не найдено', 'Убери фильтры и помести всю голову в кадр.');
    if (faces.length > 1) return fail('В кадре несколько лиц');
    landmarks = faces[0];
    const geometry = computeGeometryProfile(landmarks);
    const faceBox = boundingBoxFromLandmarks(landmarks);
    loading(true, 'Проверка стабильности…');
    const mirrored = model.detect(mirrorCanvas(el.work));
    let mirrorDelta = .42;
    if (mirrored.faceLandmarks?.length === 1) mirrorDelta = Math.abs(geometry.rating - computeGeometryProfile(mirrored.faceLandmarks[0]).rating);
    const imageData = context.getImageData(0, 0, el.work.width, el.work.height);
    currentQuality = computeImageQuality(
      imageData,
      faceBox,
      geometry,
      blendshapeMap(result.faceBlendshapes?.[0]?.categories || []),
      mirrorDelta,
      landmarks
    );
    renderQuality(currentQuality);
    drawOverlay();
    const gate = qualityGate(currentQuality);
    if (!gate.pass) return fail(gate.reason, currentQuality.issues[0]?.fix || 'Пересними кадр.');
    scans.push(createScanAssessment(geometry, currentQuality));
    hashes.push(hash);
    combined = combineAssessments(scans);
    renderProgress();
    renderResult();
    el.result.hidden = false;
    el.stage.dataset.state = 'analyzed';
    if (scans.length >= MAX_SCANS) finishSession();
    else vibrate([10, 24, 14]);
    setTimeout(() => el.result.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  } catch (error) {
    console.error('FACET analysis failed', error);
    fail('Анализ не выполнен', error?.message || 'Ошибка модели.');
  } finally {
    loading(false);
  }
}

function metric(label, value) {
  const row = document.createElement('div');
  row.className = 'metric-row';
  const name = document.createElement('span');
  name.textContent = label;
  const track = document.createElement('div');
  track.className = 'metric-track';
  const fill = document.createElement('div');
  fill.className = 'metric-fill';
  track.append(fill);
  const score = document.createElement('strong');
  score.textContent = String(value);
  row.append(name, track, score);
  requestAnimationFrame(() => { fill.style.width = `${Math.min(100, value)}%`; });
  return row;
}
function featureCard(feature) {
  const card = document.createElement('article');
  card.className = 'feature-card';
  card.dataset.level = feature.level;
  const top = document.createElement('div');
  top.className = 'feature-card-top';
  const zone = document.createElement('span');
  zone.textContent = feature.zone;
  const confidence = document.createElement('small');
  confidence.textContent = feature.confidence < 70 ? 'контур неуверенный' : 'измерено';
  top.append(zone, confidence);
  const title = document.createElement('strong');
  title.textContent = feature.label;
  const status = document.createElement('p');
  status.textContent = feature.title;
  const delta = document.createElement('b');
  const percent = Math.round(Math.abs(feature.value / Math.max(0.0001, feature.center) - 1) * 100);
  delta.textContent = feature.z < .25 ? '≈ среднее' : `${feature.signedZ > 0 ? '+' : '−'}${Math.max(1, percent)}% от центрального диапазона`;
  card.append(top, title, status, delta);
  return card;
}
function renderFeatureDetails() {
  el.featureDetails.replaceChildren(...(combined.featureDetails || []).map(featureCard));
}
function renderResult() {
  const count = combined.scanCount;
  el.resultMode.textContent = count === 1 ? 'БАЗОВЫЙ · 1 КАДР' : count === 2 ? 'УТОЧНЁННЫЙ · 2 КАДРА' : 'ПРОВЕРЕННЫЙ · 3 КАДРА';
  el.score.textContent = combined.rating.toFixed(1);
  el.range.textContent = `${combined.interval[0].toFixed(1)}–${combined.interval[1].toFixed(1)}`;
  el.label.textContent = ratingLabel(combined.rating);
  el.reliability.textContent = `${combined.reliability}%`;
  el.consistency.textContent = count > 1 ? `${combined.consistency}%` : 'не проверена';
  el.typicality.textContent = `${combined.typicalityPercentile}%`;
  el.occlusion.textContent = `${combined.occlusionScore}%`;
  el.stabilityNote.textContent = count === 1
    ? 'Оценка готова. Ещё два кадра необязательны: они проверят повторяемость и могут сузить диапазон.'
    : count === 2
      ? `Два кадра дали повторяемость ${combined.consistency}%. Третий кадр — последняя проверка.`
      : `Три кадра дали повторяемость ${combined.consistency}%. Итог использует медиану, а не лучший снимок.`;
  el.metrics.replaceChildren(
    metric('Типичность пропорций', combined.typicalityPercentile),
    metric('Координация черт', combined.coordinationScore),
    metric('Левый / правый баланс', combined.symmetryScore),
    metric('Открытость лица', combined.occlusionScore)
  );
  renderFeatureDetails();
  const unique = [];
  const seen = new Set();
  for (const issue of combined.issues || []) if (!seen.has(issue.key)) { seen.add(issue.key); unique.push(issue); }
  if (!unique.length) {
    const row = document.createElement('div');
    row.className = 'issue-row is-ok';
    row.textContent = 'Критических проблем кадра не найдено.';
    el.issues.replaceChildren(row);
  } else {
    el.issues.replaceChildren(...unique.slice(0, 3).map((issue) => {
      const row = document.createElement('div');
      row.className = 'issue-row';
      const title = document.createElement('strong');
      title.textContent = issue.title;
      const fix = document.createElement('span');
      fix.textContent = issue.fix;
      row.append(title, fix);
      return row;
    }));
  }
  el.add.hidden = finalized || count >= MAX_SCANS;
  el.add.textContent = count === 1 ? 'Проверить ещё одним кадром' : 'Добавить третий кадр';
  el.finish.hidden = finalized;
  el.finish.textContent = count === 1 ? 'Сохранить без проверки' : 'Сохранить результат';
  el.share.hidden = !finalized;
  el.reset.textContent = finalized ? 'Новый анализ' : 'Начать заново';
}
function finishSession() {
  if (!combined || finalized || scans.length < 1) return;
  finalized = true;
  combined = combineAssessments(scans);
  if (!resultSaved) saveResult();
  renderResult();
  vibrate([12, 28, 18]);
}
function saveResult() {
  const history = store.get('history', []);
  history.unshift({
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    createdAt: new Date().toISOString(),
    rating: +combined.rating.toFixed(2),
    interval: combined.interval.map((value) => +value.toFixed(2)),
    scanCount: combined.scanCount,
    reliability: combined.reliability,
    consistency: combined.consistency,
    occlusionScore: combined.occlusionScore
  });
  store.set('history', history.slice(0, 24));
  resultSaved = true;
  renderHistory();
}
function dateLabel(iso) { return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); }
function renderHistory() {
  const history = store.get('history', []);
  el.historyClear.disabled = !history.length;
  if (!history.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'История пуста.';
    el.historyList.replaceChildren(empty);
    return;
  }
  el.historyList.replaceChildren(...history.map((entry) => {
    const item = document.createElement('article');
    item.className = 'history-item';
    const score = document.createElement('div');
    score.className = 'history-score';
    score.textContent = Number(entry.rating).toFixed(1);
    const meta = document.createElement('div');
    meta.className = 'history-meta';
    const strong = document.createElement('strong');
    strong.textContent = `${entry.scanCount || 1} ${entry.scanCount === 1 ? 'кадр' : 'кадра'}`;
    const date = document.createElement('span');
    date.textContent = dateLabel(entry.createdAt);
    meta.append(strong, date);
    const range = document.createElement('div');
    range.className = 'history-range';
    range.textContent = `${Number(entry.interval[0]).toFixed(1)}–${Number(entry.interval[1]).toFixed(1)}`;
    item.append(score, meta, range);
    return item;
  }));
}
async function share() {
  if (!combined || !finalized) return;
  const text = `FACET: ${combined.rating.toFixed(1)}/5, диапазон ${combined.interval[0].toFixed(1)}–${combined.interval[1].toFixed(1)}, ${combined.scanCount} кадр(а).`;
  try {
    if (navigator.share) await navigator.share({ title: 'FACET', text });
    else { await navigator.clipboard.writeText(text); toast('Результат скопирован.'); }
  } catch (error) { if (error?.name !== 'AbortError') toast('Не удалось поделиться.'); }
}

el.consent.addEventListener('change', () => { store.set('consented', el.consent.checked); setConsent(el.consent.checked); });
el.file.addEventListener('change', () => loadPhoto(el.file.files?.[0]));
el.cameraOpen.addEventListener('click', startCamera);
el.cameraClose.addEventListener('click', () => { stopCamera(); closeDialog(el.cameraDialog); });
el.shutter.addEventListener('click', takePhoto);
el.cameraFlip.addEventListener('click', async () => { cameraFacing = cameraFacing === 'user' ? 'environment' : 'user'; await startCamera(); });
el.cameraDialog.addEventListener('close', stopCamera);
el.cameraDialog.addEventListener('cancel', stopCamera);
el.replace.addEventListener('click', () => el.file.click());
el.analyze.addEventListener('click', analyze);
el.add.addEventListener('click', () => { resetPhoto(); el.result.hidden = true; el.capture.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
el.finish.addEventListener('click', finishSession);
el.reset.addEventListener('click', () => { resetAll(); el.capture.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
el.share.addEventListener('click', share);
el.method.addEventListener('click', () => openDialog(el.methodDialog));
el.history.addEventListener('click', () => { renderHistory(); openDialog(el.historyDialog); });
el.historyClear.addEventListener('click', () => {
  if (store.get('history', []).length && confirm('Удалить историю?')) { store.set('history', []); renderHistory(); }
});
$$('[data-dialog-close]').forEach((button) => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));
for (const dialog of [el.methodDialog, el.historyDialog]) dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(dialog); });
window.addEventListener('resize', () => { drawOverlay(); if (el.cameraDialog.open) drawCameraGuide(); });
if ('ResizeObserver' in window) new ResizeObserver(drawOverlay).observe(el.stage);
document.addEventListener('visibilitychange', () => { if (document.hidden && el.cameraDialog.open) { stopCamera(); closeDialog(el.cameraDialog); } });
window.addEventListener('appdatareset', () => { store.reset(); resetAll(); setConsent(false); renderHistory(); });

setConsent(store.get('consented', false));
renderProgress();
renderHistory();
setModel(online ? 'idle' : 'error', online ? 'модель не загружена' : 'нужна сеть');
