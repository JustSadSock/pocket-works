import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  blendshapeMap, boundingBoxFromLandmarks, combineAssessments,
  computeGeometryProfile, computeImageQuality, createScanAssessment,
  qualityGate, ratingLabel
} from './analysis-engine.js';

installMobileRuntime();

const APP_VERSION = '1.1.0';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODULES = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/+esm',
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs'
];
const REQUIRED = 3;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const el = Object.fromEntries(Object.entries({
  consent: 'consent-check', capture: 'capture-panel', cameraOpen: 'camera-open', file: 'file-input', upload: 'upload-label',
  stage: 'photo-stage', empty: 'empty-photo', image: 'source-image', overlay: 'overlay-canvas', replace: 'replace-photo',
  analyze: 'analyze-button', analyzeLabel: 'analyze-label', model: 'model-status', quality: 'quality-row', progress: 'scan-progress',
  counter: 'scan-counter', result: 'result-panel', resultMode: 'result-mode', score: 'score-value', range: 'score-range',
  label: 'score-label', reliability: 'reliability-value', consistency: 'consistency-value', typicality: 'typicality-value',
  metrics: 'metric-list', issues: 'issue-list', add: 'add-scan', reset: 'reset-session', share: 'share-result', method: 'method-open',
  methodDialog: 'method-dialog', history: 'history-open', historyDialog: 'history-dialog', historyList: 'history-list',
  historyClear: 'history-clear', cameraDialog: 'camera-dialog', cameraClose: 'camera-close', video: 'camera-video',
  cameraGuide: 'camera-guide', cameraMessage: 'camera-message', shutter: 'camera-capture', cameraFlip: 'camera-flip',
  work: 'work-canvas', toast: 'toast'
}).map(([key, id]) => [key, document.getElementById(id)]));

const store = createVersionedStore({
  namespace: 'pocket-works:facet-face-lab', version: 2,
  defaults: { consented: false, history: [], haptics: true },
  migrations: { 1: (data) => ({ consented: Boolean(data?.consented), history: [], haptics: data?.haptics !== false }) },
  validate: (value) => Boolean(value && typeof value === 'object' && Array.isArray(value.history))
});

let online = navigator.onLine;
let landmarker = null;
let modelPromise = null;
let imageUrl = null;
let landmarks = null;
let cameraStream = null;
let cameraFacing = 'user';
let scans = [];
let hashes = [];
let combined = null;
let finalized = false;
let toastTimer = 0;

createWorkshopMode({
  appName: 'FACET', version: APP_VERSION, cachePrefix: 'facet-face-lab-', storageNamespace: 'pocket-works:facet-face-lab',
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
function loading(value, label = 'Анализировать кадр') {
  el.analyze.disabled = value || !el.image.src;
  el.analyze.classList.toggle('is-loading', value);
  el.analyzeLabel.textContent = label;
  el.stage.dataset.state = value ? 'scanning' : el.image.src ? 'ready' : 'empty';
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
      baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' }, runningMode: 'IMAGE', numFaces: 2,
      minFaceDetectionConfidence: .70, minFacePresenceConfidence: .70, minTrackingConfidence: .70,
      outputFaceBlendshapes: true, outputFacialTransformationMatrixes: false
    }), 42000, 'Модель загружается слишком долго');
    setModel('ready', 'готова');
    return landmarker;
  })().catch((error) => { landmarker = null; modelPromise = null; setModel('error', 'ошибка'); throw error; });
  return modelPromise;
}

function clearOverlay() { el.overlay.getContext('2d').clearRect(0, 0, el.overlay.width, el.overlay.height); }
function resetPhoto() {
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = null; landmarks = null;
  el.image.removeAttribute('src'); el.image.hidden = true; el.empty.hidden = false; el.replace.hidden = true;
  el.analyze.disabled = true; el.stage.dataset.state = 'empty'; el.quality.hidden = true; el.file.value = '';
  clearOverlay();
}
function resetAll() {
  scans = []; hashes = []; combined = null; finalized = false; el.result.hidden = true; resetPhoto(); renderProgress();
}
function renderProgress() {
  el.counter.textContent = `${scans.length}/${REQUIRED}`;
  $$('.scan-dot', el.progress).forEach((dot, index) => {
    dot.classList.toggle('is-done', index < scans.length);
    dot.classList.toggle('is-current', index === scans.length && scans.length < REQUIRED);
  });
}
function drawToCanvas(max = 960) {
  const scale = Math.min(1, max / Math.max(el.image.naturalWidth, el.image.naturalHeight));
  el.work.width = Math.max(1, Math.round(el.image.naturalWidth * scale));
  el.work.height = Math.max(1, Math.round(el.image.naturalHeight * scale));
  const context = el.work.getContext('2d', { willReadFrequently: true });
  context.clearRect(0, 0, el.work.width, el.work.height);
  context.drawImage(el.image, 0, 0, el.work.width, el.work.height);
  return context;
}
function mirrorCanvas(source) {
  const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
  const context = canvas.getContext('2d'); context.translate(canvas.width, 0); context.scale(-1, 1); context.drawImage(source, 0, 0);
  return canvas;
}
function imageHash(source) {
  const canvas = document.createElement('canvas'); canvas.width = 9; canvas.height = 8;
  const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(source, 0, 0, 9, 8);
  const data = context.getImageData(0, 0, 9, 8).data;
  const gray = (i) => data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722;
  let result = '';
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) {
    const left = (y * 9 + x) * 4; result += gray(left) < gray(left + 4) ? '1' : '0';
  }
  return result;
}
function hashDistance(a, b) { let total = Math.abs(a.length - b.length); for (let i = 0; i < Math.min(a.length, b.length); i += 1) total += a[i] !== b[i]; return total; }
function chip(label, value, good) {
  const node = document.createElement('div'); node.className = 'quality-chip'; node.dataset.state = good ? 'good' : 'warn';
  const name = document.createElement('span'); name.textContent = label;
  const score = document.createElement('strong'); score.textContent = value;
  node.append(name, score); return node;
}
function basicQuality() {
  const context = drawToCanvas(720); const data = context.getImageData(0, 0, el.work.width, el.work.height).data;
  const step = Math.max(4, Math.floor(data.length / 150000) * 4); let n = 0; let sum = 0; let squares = 0;
  for (let i = 0; i < data.length; i += step) { const g = data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722; n += 1; sum += g; squares += g * g; }
  const light = sum / Math.max(1, n); const contrast = Math.sqrt(Math.max(0, squares / Math.max(1, n) - light * light));
  const resolution = Math.min(el.image.naturalWidth, el.image.naturalHeight);
  el.quality.hidden = false;
  el.quality.replaceChildren(
    chip('Размер', resolution >= 720 ? 'хороший' : resolution >= 480 ? 'допустимый' : 'низкий', resolution >= 480),
    chip('Свет', light > 48 && light < 215 ? 'норма' : 'проверь', light > 42 && light < 225),
    chip('Контраст', contrast > 24 ? 'норма' : 'низкий', contrast > 20)
  );
}
async function loadPhoto(file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) return toast('Максимальный размер фото — 20 МБ.');
  if (file.type && !file.type.startsWith('image/')) return toast('Нужен файл изображения.');
  resetPhoto(); imageUrl = URL.createObjectURL(file); el.image.src = imageUrl;
  try {
    if (el.image.decode) await el.image.decode();
    else await new Promise((resolve, reject) => { el.image.onload = resolve; el.image.onerror = reject; });
    el.image.hidden = false; el.empty.hidden = true; el.replace.hidden = false; el.stage.dataset.state = 'ready'; el.analyze.disabled = false;
    basicQuality(); vibrate();
  } catch { resetPhoto(); toast('Не удалось прочитать фото. Попробуй JPEG или PNG.'); }
}

function drawOverlay() {
  clearOverlay(); if (!landmarks || el.image.hidden) return;
  const rect = el.stage.getBoundingClientRect(); if (!rect.width) return;
  const dpr = Math.min(2, devicePixelRatio || 1); el.overlay.width = rect.width * dpr; el.overlay.height = rect.height * dpr;
  const context = el.overlay.getContext('2d'); context.scale(dpr, dpr);
  const imageRatio = el.image.naturalWidth / el.image.naturalHeight; const stageRatio = rect.width / rect.height;
  const shownHeight = imageRatio > stageRatio ? rect.height : rect.width / imageRatio;
  const shownWidth = imageRatio > stageRatio ? rect.height * imageRatio : rect.width;
  const offsetX = (rect.width - shownWidth) / 2; const offsetY = (rect.height - shownHeight) / 2;
  context.fillStyle = 'rgba(32,79,116,.82)';
  for (const index of [10,152,33,133,362,263,98,327,61,291,234,454]) {
    const point = landmarks[index]; context.beginPath(); context.arc(offsetX + point.x * shownWidth, offsetY + point.y * shownHeight, 2.2, 0, Math.PI * 2); context.fill();
  }
}
function drawCameraGuide() {
  const rect = el.cameraGuide.getBoundingClientRect(); if (!rect.width) return;
  const dpr = Math.min(2, devicePixelRatio || 1); el.cameraGuide.width = rect.width * dpr; el.cameraGuide.height = rect.height * dpr;
  const context = el.cameraGuide.getContext('2d'); context.scale(dpr, dpr); context.clearRect(0, 0, rect.width, rect.height);
  const cx = rect.width / 2; const cy = rect.height * .45; const rx = Math.min(rect.width * .28, rect.height * .22); const ry = rx * 1.35;
  context.strokeStyle = 'rgba(255,255,255,.86)'; context.lineWidth = 1.5; context.setLineDash([9,7]); context.beginPath(); context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); context.stroke();
  context.setLineDash([]); context.strokeStyle = 'rgba(235,185,72,.92)'; context.beginPath(); context.moveTo(cx-rx*1.2, cy-ry*.16); context.lineTo(cx+rx*1.2, cy-ry*.16); context.stroke();
}
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) return toast('Камера недоступна. Выбери фото из галереи.');
  openDialog(el.cameraDialog); stopCamera(); el.shutter.disabled = true; el.cameraMessage.textContent = 'Запрашиваю доступ…';
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: cameraFacing }, width: { ideal: 1280 }, height: { ideal: 1600 } } });
    el.video.srcObject = cameraStream; await el.video.play(); el.video.style.transform = cameraFacing === 'user' ? 'scaleX(-1)' : 'none';
    el.shutter.disabled = false; el.cameraMessage.textContent = 'Прямо · нейтрально · мягкий свет'; requestAnimationFrame(drawCameraGuide);
  } catch { el.cameraMessage.textContent = 'Нет доступа к камере'; }
}
function stopCamera() { if (cameraStream) for (const track of cameraStream.getTracks()) track.stop(); cameraStream = null; el.video.srcObject = null; }
async function takePhoto() {
  if (!cameraStream || !el.video.videoWidth) return;
  const scale = Math.min(1, 1440 / el.video.videoWidth); el.work.width = Math.round(el.video.videoWidth * scale); el.work.height = Math.round(el.video.videoHeight * scale);
  const context = el.work.getContext('2d'); if (cameraFacing === 'user') { context.translate(el.work.width, 0); context.scale(-1, 1); }
  context.drawImage(el.video, 0, 0, el.work.width, el.work.height);
  const blob = await new Promise((resolve) => el.work.toBlob(resolve, 'image/jpeg', .92)); stopCamera(); closeDialog(el.cameraDialog); if (blob) loadPhoto(blob);
}

function fail(message, detail = '') { toast(detail ? `${message}. ${detail}` : message, 4300); vibrate([18,35,18]); }
function renderQuality(quality) {
  el.quality.hidden = false;
  el.quality.replaceChildren(
    chip('Резкость', String(Math.round(quality.metrics.sharpness)), quality.metrics.sharpness >= 72),
    chip('Фронтальность', String(Math.round(quality.metrics.frontal)), quality.metrics.frontal >= 72),
    chip('Надёжность', String(Math.round(quality.reliability)), quality.reliability >= 68)
  );
}
async function analyze() {
  if (!el.image.src || finalized) return;
  loading(true, 'Подготовка…'); landmarks = null; clearOverlay();
  try {
    const model = await getModel(); const context = drawToCanvas(); const hash = imageHash(el.work);
    if (hashes.some((known) => hashDistance(hash, known) < 7)) return fail('Этот кадр почти совпадает с предыдущим', 'Пересними фото.');
    loading(true, 'Проверка лица…'); await new Promise(requestAnimationFrame);
    const result = model.detect(el.work); const faces = result.faceLandmarks || [];
    if (!faces.length) return fail('Лицо не найдено', 'Увеличь лицо и убери фильтры.');
    if (faces.length > 1) return fail('В кадре несколько лиц');
    landmarks = faces[0]; const geometry = computeGeometryProfile(landmarks); const faceBox = boundingBoxFromLandmarks(landmarks);
    loading(true, 'Проверка стабильности…');
    const mirrored = model.detect(mirrorCanvas(el.work)); let mirrorDelta = .42;
    if (mirrored.faceLandmarks?.length === 1) mirrorDelta = Math.abs(geometry.rating - computeGeometryProfile(mirrored.faceLandmarks[0]).rating);
    const quality = computeImageQuality(
      context.getImageData(0, 0, el.work.width, el.work.height), faceBox, geometry,
      blendshapeMap(result.faceBlendshapes?.[0]?.categories || []), mirrorDelta
    );
    renderQuality(quality); drawOverlay(); const gate = qualityGate(quality);
    if (!gate.pass) return fail(gate.reason, quality.issues[0]?.fix || 'Пересними кадр.');
    scans.push(createScanAssessment(geometry, quality)); hashes.push(hash); combined = combineAssessments(scans);
    renderProgress(); renderResult(); el.result.hidden = false; el.stage.dataset.state = 'analyzed';
    if (scans.length >= REQUIRED) finish(); else vibrate([10,24,14]);
    setTimeout(() => el.result.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  } catch (error) { console.error('FACET analysis failed', error); fail('Анализ не выполнен', error?.message || 'Ошибка модели.'); }
  finally { loading(false); }
}

function metric(label, value) {
  const row = document.createElement('div'); row.className = 'metric-row';
  const name = document.createElement('span'); name.textContent = label;
  const track = document.createElement('div'); track.className = 'metric-track'; const fill = document.createElement('div'); fill.className = 'metric-fill'; track.append(fill);
  const score = document.createElement('strong'); score.textContent = value; row.append(name, track, score);
  requestAnimationFrame(() => { fill.style.width = `${Math.min(100, value)}%`; }); return row;
}
function renderResult() {
  const done = finalized || combined.scanCount >= REQUIRED;
  el.resultMode.textContent = done ? 'ИТОГ · 3 КАДРА' : `ПРЕДВАРИТЕЛЬНО · ${combined.scanCount}/${REQUIRED}`;
  el.score.textContent = combined.rating.toFixed(1); el.range.textContent = `${combined.interval[0].toFixed(1)}–${combined.interval[1].toFixed(1)}`;
  el.label.textContent = ratingLabel(combined.rating); el.reliability.textContent = `${combined.reliability}%`;
  el.consistency.textContent = done ? `${combined.consistency}%` : '—'; el.typicality.textContent = `${combined.typicalityPercentile}%`;
  el.metrics.replaceChildren(metric('Типичность пропорций', combined.typicalityPercentile), metric('Координация черт', combined.coordinationScore), metric('Левый / правый баланс', combined.symmetryScore));
  const unique = []; const seen = new Set();
  for (const issue of combined.issues || []) if (!seen.has(issue.key)) { seen.add(issue.key); unique.push(issue); }
  if (!unique.length) { const row = document.createElement('div'); row.className = 'issue-row is-ok'; row.textContent = 'Кадр прошёл проверку.'; el.issues.replaceChildren(row); }
  else el.issues.replaceChildren(...unique.slice(0,2).map((issue) => { const row = document.createElement('div'); row.className = 'issue-row'; row.innerHTML = `<strong>${issue.title}</strong><span>${issue.fix}</span>`; return row; }));
  el.add.hidden = done; el.share.hidden = !done; el.reset.textContent = done ? 'Новый анализ' : 'Начать заново';
}
function finish() {
  if (!combined || finalized || scans.length < REQUIRED) return;
  finalized = true; combined = combineAssessments(scans); saveResult(); renderResult(); vibrate([12,28,18]);
}
function saveResult() {
  const history = store.get('history', []);
  history.unshift({ id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, createdAt: new Date().toISOString(), rating: +combined.rating.toFixed(2), interval: combined.interval.map((v) => +v.toFixed(2)), scanCount: combined.scanCount, reliability: combined.reliability, consistency: combined.consistency });
  store.set('history', history.slice(0, 24)); renderHistory();
}
function dateLabel(iso) { return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); }
function renderHistory() {
  const history = store.get('history', []); el.historyClear.disabled = !history.length;
  if (!history.length) { const empty = document.createElement('div'); empty.className = 'history-empty'; empty.textContent = 'История пуста.'; el.historyList.replaceChildren(empty); return; }
  el.historyList.replaceChildren(...history.map((entry) => {
    const item = document.createElement('article'); item.className = 'history-item';
    item.innerHTML = `<div class="history-score">${Number(entry.rating).toFixed(1)}</div><div class="history-meta"><strong>3 кадра</strong><span>${dateLabel(entry.createdAt)}</span></div><div class="history-range">${entry.interval[0].toFixed(1)}–${entry.interval[1].toFixed(1)}</div>`;
    return item;
  }));
}
async function share() {
  if (!combined || !finalized) return;
  const text = `FACET: ${combined.rating.toFixed(1)}/5, диапазон ${combined.interval[0].toFixed(1)}–${combined.interval[1].toFixed(1)}, 3 кадра.`;
  try { if (navigator.share) await navigator.share({ title: 'FACET', text }); else { await navigator.clipboard.writeText(text); toast('Результат скопирован.'); } }
  catch (error) { if (error?.name !== 'AbortError') toast('Не удалось поделиться.'); }
}

el.consent.addEventListener('change', () => { store.set('consented', el.consent.checked); setConsent(el.consent.checked); });
el.file.addEventListener('change', () => loadPhoto(el.file.files?.[0]));
el.cameraOpen.addEventListener('click', startCamera);
el.cameraClose.addEventListener('click', () => { stopCamera(); closeDialog(el.cameraDialog); });
el.shutter.addEventListener('click', takePhoto);
el.cameraFlip.addEventListener('click', async () => { cameraFacing = cameraFacing === 'user' ? 'environment' : 'user'; await startCamera(); });
el.cameraDialog.addEventListener('close', stopCamera); el.cameraDialog.addEventListener('cancel', stopCamera);
el.replace.addEventListener('click', () => el.file.click()); el.analyze.addEventListener('click', analyze);
el.add.addEventListener('click', () => { resetPhoto(); el.result.hidden = true; el.capture.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
el.reset.addEventListener('click', () => { resetAll(); el.capture.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
el.share.addEventListener('click', share); el.method.addEventListener('click', () => openDialog(el.methodDialog));
el.history.addEventListener('click', () => { renderHistory(); openDialog(el.historyDialog); });
el.historyClear.addEventListener('click', () => { if (store.get('history', []).length && confirm('Удалить историю?')) { store.set('history', []); renderHistory(); } });
$$('[data-dialog-close]').forEach((button) => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));
for (const dialog of [el.methodDialog, el.historyDialog]) dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(dialog); });
window.addEventListener('resize', () => { drawOverlay(); if (el.cameraDialog.open) drawCameraGuide(); });
if ('ResizeObserver' in window) new ResizeObserver(drawOverlay).observe(el.stage);
document.addEventListener('visibilitychange', () => { if (document.hidden && el.cameraDialog.open) { stopCamera(); closeDialog(el.cameraDialog); } });
window.addEventListener('appdatareset', () => { store.reset(); resetAll(); setConsent(false); renderHistory(); });

setConsent(store.get('consented', false)); renderProgress(); renderHistory(); setModel(online ? 'idle' : 'error', online ? 'модель не загружена' : 'нужна сеть');
