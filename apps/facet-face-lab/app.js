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

const APP_VERSION = '1.4.0';
const REQUIRED_FRAMES = 3;
const MIN_INTERVAL_MS = 3000;
const SESSION_TIMEOUT_MS = 90000;
const STANDARD_FOV_SCALE = 1.16;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODULES = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/+esm',
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs'
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const mad = (values) => {
  const center = median(values);
  return median(values.map((value) => Math.abs(value - center)));
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const el = Object.fromEntries(Object.entries({
  consent: 'consent-check', capture: 'capture-panel', captureHint: 'capture-hint', cameraOpen: 'camera-open',
  file: 'file-input', upload: 'upload-label', progress: 'scan-progress', counter: 'scan-counter',
  sessionReadout: 'session-readout', sessionFrames: 'session-frames', stage: 'photo-stage', empty: 'empty-photo',
  image: 'source-image', overlay: 'overlay-canvas', quality: 'quality-row', model: 'model-status',
  result: 'result-panel', resultMode: 'result-mode', score: 'score-value', range: 'score-range', label: 'score-label',
  reliability: 'reliability-value', consistency: 'consistency-value', typicality: 'typicality-value',
  occlusion: 'occlusion-value', protocol: 'protocol-value', stabilityNote: 'stability-note', frameEvidence: 'frame-evidence',
  metrics: 'metric-list', atlas: 'face-atlas', radar: 'region-radar', radarLegend: 'radar-legend',
  traitList: 'trait-list', takeaways: 'takeaway-list', featureDetails: 'feature-detail-list', issues: 'issue-list',
  reset: 'reset-session', share: 'share-result', method: 'method-open', methodDialog: 'method-dialog',
  history: 'history-open', historyDialog: 'history-dialog', historyList: 'history-list', historyClear: 'history-clear',
  cameraDialog: 'camera-dialog', cameraView: 'camera-view', cameraClose: 'camera-close', video: 'camera-video',
  cameraGuide: 'camera-guide', cameraMessage: 'camera-message', cameraStatus: 'camera-status', shutter: 'camera-capture',
  shutterLabel: 'camera-capture-label', cameraFlip: 'camera-flip', cameraFov: 'camera-fov', cameraLens: 'camera-lens',
  cameraCounter: 'camera-counter', cameraCountdown: 'camera-countdown', cameraFrames: 'camera-frames',
  work: 'work-canvas', toast: 'toast'
}).map(([key, id]) => [key, document.getElementById(id)]));

const store = createVersionedStore({
  namespace: 'pocket-works:facet-face-lab',
  version: 5,
  defaults: { consented: false, history: [], haptics: true, cameraFov: 'standard' },
  migrations: {
    1: (data) => ({ consented: Boolean(data?.consented), history: [], haptics: data?.haptics !== false, cameraFov: 'standard' }),
    2: (data) => ({ consented: Boolean(data?.consented), history: Array.isArray(data?.history) ? data.history : [], haptics: data?.haptics !== false, cameraFov: 'standard' }),
    3: (data) => ({ ...data, cameraFov: data?.cameraFov === 'wide' ? 'wide' : 'standard' }),
    4: (data) => ({ ...data, history: Array.isArray(data?.history) ? data.history : [] })
  },
  validate: (value) => Boolean(value && typeof value === 'object' && Array.isArray(value.history))
});

let online = navigator.onLine;
let landmarker = null;
let modelPromise = null;
let imageUrl = null;
let cameraStream = null;
let cameraFacing = 'user';
let cameraFov = store.get('cameraFov', 'standard');
let cameraDeviceId = null;
let scans = [];
let hashes = [];
let combined = null;
let finalized = false;
let resultSaved = false;
let activeTraitZone = 'outline';
let finalLandmarks = null;
let finalQuality = null;
let sessionRunning = false;
let sessionCancelled = false;
let toastTimer = 0;

class FrameError extends Error {
  constructor(message, fix = '') {
    super(message);
    this.name = 'FrameError';
    this.fix = fix;
  }
}

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

function vibrate(pattern = 10) {
  if (store.get('haptics', true) && navigator.vibrate) navigator.vibrate(pattern);
}
function toast(message, time = 4000) {
  clearTimeout(toastTimer);
  el.toast.textContent = message;
  el.toast.classList.add('is-visible');
  toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), time);
}
function setModel(state, text) {
  el.model.dataset.status = state;
  $('span', el.model).textContent = text;
}
function openDialog(dialog) {
  if (dialog.showModal) {
    if (!dialog.open) dialog.showModal();
  } else dialog.setAttribute('open', '');
}
function closeDialog(dialog) {
  if (dialog.close && dialog.open) dialog.close();
  else dialog.removeAttribute('open');
}
function setConsent(value) {
  el.consent.checked = value;
  el.capture.classList.toggle('is-locked', !value);
  el.cameraOpen.disabled = !value;
  el.file.disabled = !value;
  el.upload.setAttribute('aria-disabled', String(!value));
}
function timeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })
  ]).finally(() => clearTimeout(timer));
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
        if (candidate.FaceLandmarker && candidate.FilesetResolver) {
          visionModule = candidate;
          break;
        }
      } catch (error) {
        lastError = error;
      }
    }
    if (!visionModule) throw lastError || new Error('MediaPipe недоступен');
    const vision = await timeout(visionModule.FilesetResolver.forVisionTasks(WASM), 26000, 'Ошибка вычислительного ядра');
    landmarker = await timeout(visionModule.FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
      runningMode: 'IMAGE',
      numFaces: 2,
      minFaceDetectionConfidence: .74,
      minFacePresenceConfidence: .74,
      minTrackingConfidence: .74,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true
    }), 42000, 'Модель загружается слишком долго');
    setModel('ready', 'готова');
    return landmarker;
  })().catch((error) => {
    landmarker = null;
    modelPromise = null;
    setModel('error', 'ошибка');
    throw error;
  });
  return modelPromise;
}

function clearOverlay() {
  const context = el.overlay.getContext('2d');
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, el.overlay.width, el.overlay.height);
}
function resetPreview() {
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = null;
  el.image.removeAttribute('src');
  el.image.hidden = true;
  el.empty.hidden = false;
  el.quality.hidden = true;
  clearOverlay();
}
function resetAll() {
  sessionCancelled = true;
  scans = [];
  hashes = [];
  combined = null;
  finalized = false;
  resultSaved = false;
  finalLandmarks = null;
  finalQuality = null;
  activeTraitZone = 'outline';
  el.result.hidden = true;
  resetPreview();
  renderProgress();
  renderSessionFrames();
}
function renderProgress() {
  const count = scans.length;
  el.counter.textContent = `${count}/${REQUIRED_FRAMES}`;
  el.captureHint.textContent = count === 0
    ? 'Три кадра снимаются автоматически. Между принятыми кадрами проходит не меньше 3 секунд.'
    : count < REQUIRED_FRAMES
      ? `Принято ${count} из ${REQUIRED_FRAMES}. Результат появится только после полной серии.`
      : 'Серия завершена: три валидных кадра приняты.';
  $$('.scan-dot', el.progress).forEach((dot, index) => {
    dot.classList.toggle('is-done', index < count);
    dot.classList.toggle('is-current', index === count && count < REQUIRED_FRAMES);
  });
  el.sessionReadout.textContent = count
    ? `${count} валидных кадра из ${REQUIRED_FRAMES}`
    : 'Автосъёмка · 3 кадра · интервал ≥ 3 с';
}
function renderSessionFrames() {
  const nodes = [];
  for (let index = 0; index < REQUIRED_FRAMES; index += 1) {
    const scan = scans[index];
    const item = document.createElement('div');
    item.className = 'session-frame';
    item.dataset.state = scan ? 'done' : index === scans.length ? 'current' : 'waiting';
    const number = document.createElement('strong');
    number.textContent = String(index + 1).padStart(2, '0');
    const text = document.createElement('span');
    text.textContent = scan ? `${scan.reliability}% надёжность` : index === scans.length ? 'следующий' : 'ожидание';
    item.append(number, text);
    nodes.push(item);
  }
  el.sessionFrames.replaceChildren(...nodes);
}

function canvasHash(source) {
  const canvas = document.createElement('canvas');
  canvas.width = 9;
  canvas.height = 8;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0, 9, 8);
  const data = context.getImageData(0, 0, 9, 8).data;
  const gray = (i) => data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722;
  let result = '';
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = (y * 9 + x) * 4;
      result += gray(left) < gray(left + 4) ? '1' : '0';
    }
  }
  return result;
}
function hashDistance(a, b) {
  let total = Math.abs(a.length - b.length);
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) total += a[i] !== b[i];
  return total;
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
function cropRect(videoWidth, videoHeight, aspect, zoom) {
  let width = videoWidth;
  let height = videoHeight;
  if (width / height > aspect) width = height * aspect;
  else height = width / aspect;
  width /= zoom;
  height /= zoom;
  return { sx: (videoWidth - width) / 2, sy: (videoHeight - height) / 2, sw: width, sh: height };
}
function captureVideoCanvas() {
  const targetAspect = 3 / 4;
  const zoom = cameraFov === 'standard' ? STANDARD_FOV_SCALE : 1;
  const source = cropRect(el.video.videoWidth, el.video.videoHeight, targetAspect, zoom);
  const canvas = document.createElement('canvas');
  canvas.height = 1400;
  canvas.width = Math.round(canvas.height * targetAspect);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (cameraFacing === 'user') {
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(el.video, source.sx, source.sy, source.sw, source.sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}
async function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Не удалось сохранить кадр')), 'image/jpeg', .93);
  });
}
async function fileToCanvas(file) {
  if (file.size > 20 * 1024 * 1024) throw new FrameError('Файл слишком большой', 'Максимальный размер — 20 МБ.');
  if (file.type && !file.type.startsWith('image/')) throw new FrameError('Неверный формат', 'Выбери JPEG, PNG, WebP или HEIC.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    if (image.decode) await image.decode();
    else await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
    const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d', { willReadFrequently: true }).drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function assessCanvas(canvas, meta) {
  const model = await getModel();
  const hash = canvasHash(canvas);
  if (hashes.some((known) => hashDistance(hash, known) < 2)) {
    throw new FrameError('Кадр практически не изменился', 'Поток мог зависнуть. Немного измени положение телефона.');
  }
  const result = model.detect(canvas);
  const faces = result.faceLandmarks || [];
  if (!faces.length) throw new FrameError('Лицо не найдено', 'Помести всю голову внутрь контура.');
  if (faces.length > 1) throw new FrameError('В кадре несколько лиц', 'В серии должно быть только одно лицо.');
  const landmarks = faces[0];
  const geometry = computeGeometryProfile(landmarks);
  const mirrored = model.detect(mirrorCanvas(canvas));
  let mirrorDelta = .42;
  if (mirrored.faceLandmarks?.length === 1) {
    mirrorDelta = Math.abs(geometry.rating - computeGeometryProfile(mirrored.faceLandmarks[0]).rating);
  }
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const quality = computeImageQuality(
    imageData,
    boundingBoxFromLandmarks(landmarks),
    geometry,
    blendshapeMap(result.faceBlendshapes?.[0]?.categories || []),
    mirrorDelta,
    landmarks
  );
  const gate = qualityGate(quality);
  if (!gate.pass) {
    throw new FrameError(gate.reason, quality.issues[0]?.fix || 'Исправь положение и дождись следующей попытки.');
  }
  const assessment = createScanAssessment(geometry, quality);
  assessment.previewLandmarks = landmarks;
  assessment.previewQuality = quality;
  assessment.capture = {
    source: meta.source,
    capturedAt: meta.capturedAt,
    index: meta.index,
    hash,
    frontal: Math.round(quality.metrics.frontal),
    visibility: Math.round(quality.metrics.occlusion),
    sharpness: Math.round(quality.metrics.sharpness),
    exposure: Math.round(quality.metrics.exposure)
  };
  return { assessment, hash, landmarks, quality, canvas };
}

function combineProtocolAssessments(values) {
  const base = combineAssessments(values);
  const featureKeys = values[0]?.featureDetails?.map((item) => item.key) || [];
  const featureDispersion = median(featureKeys.map((key) => {
    const zValues = values.map((scan) => scan.featureDetails.find((item) => item.key === key)?.signedZ ?? 0);
    return mad(zValues) * 1.4826;
  }));
  const geometryConsistency = clamp(100 - featureDispersion * 58, 0, 100);
  const consistency = Math.round(Math.min(base.consistency, geometryConsistency));
  const orderedTimes = values.map((scan) => scan.capture.capturedAt);
  const intervals = orderedTimes.slice(1).map((time, index) => time - orderedTimes[index]);
  const allCamera = values.every((scan) => scan.capture.source === 'camera');
  const timingVerified = allCamera && intervals.every((value) => value >= MIN_INTERVAL_MS - 80);
  const minHashDistance = Math.min(
    hashDistance(values[0].capture.hash, values[1].capture.hash),
    hashDistance(values[1].capture.hash, values[2].capture.hash),
    hashDistance(values[0].capture.hash, values[2].capture.hash)
  );
  const frozenPenalty = minHashDistance < 2 ? 18 : 0;
  const sourcePenalty = timingVerified ? 0 : 7;
  const consistencyPenalty = Math.max(0, 72 - consistency) * .15;
  const reliability = Math.round(clamp(base.reliability - sourcePenalty - frozenPenalty - consistencyPenalty, 0, 100));
  const halfWidth = clamp(
    base.halfWidth + (100 - consistency) * .004 + (timingVerified ? 0 : .12) + frozenPenalty * .006,
    .55,
    1.28
  );
  return {
    ...base,
    consistency,
    geometryConsistency: Math.round(geometryConsistency),
    reliability,
    halfWidth,
    interval: [clamp(base.rating - halfWidth, 1, 5), clamp(base.rating + halfWidth, 1, 5)],
    intervals,
    timingVerified,
    protocolLabel: timingVerified ? 'Автосерия подтверждена' : 'Три файла · интервал не проверен',
    protocolShort: timingVerified ? 'проверен' : 'частично',
    minHashDistance
  };
}

function cameraLabelScore(label, facing) {
  const normalized = label.toLowerCase();
  let score = 0;
  if (facing === 'user') {
    if (/front|facetime|user|true.?depth|перед/.test(normalized)) score += 10;
    if (/back|rear|environment|зад/.test(normalized)) score -= 12;
  } else {
    if (/back|rear|environment|зад/.test(normalized)) score += 10;
    if (/front|facetime|user|перед/.test(normalized)) score -= 12;
  }
  if (/ultra|wide.?angle|0[.,]5|сверхшир/.test(normalized)) score -= 14;
  if (/tele|macro/.test(normalized)) score -= 8;
  if (/standard|main|1x|1×|обыч/.test(normalized)) score += 5;
  return score;
}
async function choosePreferredDevice(facing) {
  if (!navigator.mediaDevices?.enumerateDevices) return null;
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
    const scored = devices.map((device) => ({ device, score: cameraLabelScore(device.label || '', facing) })).sort((a, b) => b.score - a.score);
    return scored[0]?.score > 0 ? scored[0].device.deviceId : null;
  } catch {
    return null;
  }
}
async function resetTrackZoom(track) {
  try {
    const capabilities = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
    if (!capabilities.zoom || typeof track.applyConstraints !== 'function') return;
    const min = Number(capabilities.zoom.min ?? 1);
    const max = Number(capabilities.zoom.max ?? min);
    await track.applyConstraints({ advanced: [{ zoom: clamp(1, min, max) }] });
  } catch (error) {
    console.warn('Camera zoom reset is unavailable', error);
  }
}
function cameraConstraints(deviceId = null) {
  return {
    audio: false,
    video: deviceId
      ? { deviceId: { exact: deviceId }, resizeMode: 'none' }
      : { facingMode: { ideal: cameraFacing }, resizeMode: 'none' }
  };
}
async function openCameraStream() {
  let stream = await navigator.mediaDevices.getUserMedia(cameraConstraints(cameraDeviceId));
  const preferred = await choosePreferredDevice(cameraFacing);
  const currentId = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
  if (preferred && preferred !== currentId) {
    stream.getTracks().forEach((track) => track.stop());
    stream = await navigator.mediaDevices.getUserMedia(cameraConstraints(preferred));
    cameraDeviceId = preferred;
  }
  return stream;
}
function updateCameraFovUi() {
  const standard = cameraFov === 'standard';
  el.cameraView.dataset.fov = cameraFov;
  el.cameraFov.textContent = standard ? '1×' : '0.8×';
  el.cameraFov.setAttribute('aria-label', standard ? 'Переключить на широкий кадр' : 'Переключить на обычный кадр');
}
function updateCameraSeriesUi(status = 'ready', message = '') {
  el.cameraStatus.dataset.state = status;
  el.cameraStatus.textContent = message || (status === 'ready' ? 'Готово к серии' : '');
  el.cameraCounter.textContent = `${scans.length}/${REQUIRED_FRAMES}`;
  $$('.camera-frame-dot', el.cameraFrames).forEach((dot, index) => {
    dot.classList.toggle('is-done', index < scans.length);
    dot.classList.toggle('is-current', index === scans.length && scans.length < REQUIRED_FRAMES);
  });
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
  const cy = rect.height * .44;
  const rx = Math.min(rect.width * .26, rect.height * .20);
  const ry = rx * 1.34;
  context.strokeStyle = 'rgba(255,255,255,.9)';
  context.lineWidth = 1.5;
  context.setLineDash([9, 7]);
  context.beginPath();
  context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);
  context.strokeStyle = 'rgba(235,185,72,.95)';
  context.beginPath();
  context.moveTo(cx - rx * 1.18, cy - ry * .16);
  context.lineTo(cx + rx * 1.18, cy - ry * .16);
  context.stroke();
}
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) return toast('Камера недоступна. Выбери три фото из галереи.');
  resetAll();
  sessionCancelled = false;
  openDialog(el.cameraDialog);
  el.shutter.disabled = true;
  el.cameraMessage.textContent = 'Запрашиваю доступ к камере…';
  updateCameraSeriesUi('loading', 'Подготовка камеры и модели');
  try {
    const [, stream] = await Promise.all([getModel(), openCameraStream()]);
    cameraStream = stream;
    const track = cameraStream.getVideoTracks()[0];
    if (track) {
      await resetTrackZoom(track);
      const label = track.label || '';
      el.cameraLens.textContent = /ultra|wide.?angle|0[.,]5/i.test(label) ? 'Широкий объектив' : 'Фронтальная камера';
    }
    el.video.srcObject = cameraStream;
    await el.video.play();
    el.video.classList.toggle('is-mirrored', cameraFacing === 'user');
    updateCameraFovUi();
    updateCameraSeriesUi('ready', 'Один запуск — три автоматических кадра');
    el.cameraMessage.textContent = 'Держи голову прямо. После запуска приложение само выберет три валидных момента.';
    el.shutter.disabled = false;
    el.shutterLabel.textContent = 'Начать серию';
    requestAnimationFrame(drawCameraGuide);
  } catch (error) {
    console.error('Camera start failed', error);
    updateCameraSeriesUi('error', 'Камера недоступна');
    el.cameraMessage.textContent = error?.message || 'Нет доступа к камере';
  }
}
function stopCamera() {
  if (cameraStream) for (const track of cameraStream.getTracks()) track.stop();
  cameraStream = null;
  el.video.srcObject = null;
}
function cancelCameraSession() {
  sessionCancelled = true;
  sessionRunning = false;
  stopCamera();
  closeDialog(el.cameraDialog);
}
async function runCountdown(seconds) {
  for (let remaining = seconds; remaining > 0; remaining -= 1) {
    if (sessionCancelled) throw new Error('cancelled');
    el.cameraCountdown.textContent = String(remaining);
    updateCameraSeriesUi('countdown', `Кадр ${scans.length + 1}: не двигайся`);
    await sleep(1000);
  }
  el.cameraCountdown.textContent = '';
}
async function runCameraSeries() {
  if (sessionRunning || !cameraStream) return;
  sessionRunning = true;
  sessionCancelled = false;
  scans = [];
  hashes = [];
  renderProgress();
  renderSessionFrames();
  el.shutter.disabled = true;
  el.cameraFlip.disabled = true;
  el.cameraFov.disabled = true;
  el.shutterLabel.textContent = 'Серия идёт';
  const startedAt = Date.now();
  let failedAttempts = 0;
  try {
    while (scans.length < REQUIRED_FRAMES) {
      if (sessionCancelled) throw new Error('cancelled');
      if (Date.now() - startedAt > SESSION_TIMEOUT_MS) throw new FrameError('Серия заняла слишком много времени', 'Начни заново при ровном свете.');
      await runCountdown(3);
      if (sessionCancelled) throw new Error('cancelled');
      updateCameraSeriesUi('analyzing', `Проверяю кадр ${scans.length + 1}`);
      el.cameraMessage.textContent = 'Проверяю резкость, положение, свет и перекрытия…';
      const canvas = captureVideoCanvas();
      const capturedAt = Date.now();
      try {
        const accepted = await assessCanvas(canvas, { source: 'camera', capturedAt, index: scans.length });
        scans.push(accepted.assessment);
        hashes.push(accepted.hash);
        accepted.assessment.previewCanvas = accepted.canvas;
        failedAttempts = 0;
        renderProgress();
        renderSessionFrames();
        updateCameraSeriesUi('accepted', `Кадр ${scans.length} принят`);
        el.cameraMessage.textContent = scans.length < REQUIRED_FRAMES
          ? `Принято ${scans.length}/${REQUIRED_FRAMES}. Следующий кадр будет не раньше чем через 3 секунды.`
          : 'Три кадра приняты. Формирую итог.';
        vibrate([12, 26, 12]);
        await sleep(700);
      } catch (error) {
        if (!(error instanceof FrameError)) throw error;
        failedAttempts += 1;
        updateCameraSeriesUi('retry', error.message);
        el.cameraMessage.textContent = error.fix || 'Исправь положение. Приложение попробует снова.';
        vibrate([18, 40, 18]);
        if (failedAttempts >= 6) throw new FrameError('Не удаётся получить стабильный кадр', error.fix || 'Измени свет или дистанцию и начни серию заново.');
        await sleep(1700);
      }
    }
    await finalizeSession('camera');
    stopCamera();
    closeDialog(el.cameraDialog);
  } catch (error) {
    if (error?.message !== 'cancelled') {
      updateCameraSeriesUi('error', error.message || 'Серия прервана');
      el.cameraMessage.textContent = error.fix || 'Попробуй начать заново.';
      toast(error.fix ? `${error.message}. ${error.fix}` : error.message, 5200);
      el.shutter.disabled = false;
      el.shutterLabel.textContent = 'Начать заново';
    }
  } finally {
    sessionRunning = false;
    el.cameraFlip.disabled = false;
    el.cameraFov.disabled = false;
  }
}

async function runGallerySeries(files) {
  const selected = [...files];
  el.file.value = '';
  if (selected.length !== REQUIRED_FRAMES) return toast('Выбери ровно три разных фотографии.');
  resetAll();
  sessionCancelled = false;
  el.capture.dataset.busy = 'true';
  el.sessionReadout.textContent = 'Проверяю три файла…';
  try {
    await getModel();
    for (let index = 0; index < selected.length; index += 1) {
      const canvas = await fileToCanvas(selected[index]);
      const accepted = await assessCanvas(canvas, {
        source: 'gallery',
        capturedAt: Number(selected[index].lastModified) || Date.now() + index,
        index
      });
      scans.push(accepted.assessment);
      hashes.push(accepted.hash);
      accepted.assessment.previewCanvas = accepted.canvas;
      renderProgress();
      renderSessionFrames();
      el.sessionReadout.textContent = `Проверено ${index + 1}/${REQUIRED_FRAMES}`;
      await sleep(120);
    }
    await finalizeSession('gallery');
  } catch (error) {
    const message = error instanceof FrameError
      ? `${error.message}${error.fix ? `. ${error.fix}` : ''}`
      : error?.message || 'Не удалось проверить фотографии.';
    resetAll();
    toast(message, 5400);
  } finally {
    delete el.capture.dataset.busy;
  }
}

async function setPreviewFromCanvas(canvas) {
  resetPreview();
  const blob = await canvasToBlob(canvas);
  imageUrl = URL.createObjectURL(blob);
  el.image.src = imageUrl;
  if (el.image.decode) await el.image.decode();
  el.image.hidden = false;
  el.empty.hidden = true;
  el.quality.hidden = false;
  el.quality.replaceChildren(
    chip('Кадры', '3/3', 'good'),
    chip('Интервалы', combined.timingVerified ? 'проверены' : 'не проверены', combined.timingVerified ? 'good' : 'warn'),
    chip('Повторяемость', `${combined.consistency}%`, combined.consistency >= 70 ? 'good' : 'warn'),
    chip('Надёжность', `${combined.reliability}%`, combined.reliability >= 72 ? 'good' : 'warn')
  );
  drawOverlay();
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
async function finalizeSession(source) {
  if (scans.length !== REQUIRED_FRAMES) throw new Error('Недостаточно валидных кадров');
  combined = combineProtocolAssessments(scans);
  finalized = true;
  combined.source = source;
  const visualScan = scans.slice().sort((a, b) => b.reliability - a.reliability)[0] || scans.at(-1);
  finalLandmarks = visualScan.previewLandmarks;
  finalQuality = visualScan.previewQuality;
  await setPreviewFromCanvas(visualScan.previewCanvas);
  renderResult();
  saveResult();
  el.result.hidden = false;
  renderProgress();
  renderSessionFrames();
  vibrate([12, 30, 18, 30, 12]);
  setTimeout(() => el.result.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
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
  if (!finalLandmarks || el.image.hidden) return;
  const { rect, shownWidth, shownHeight, offsetX, offsetY } = imagePlacement();
  if (!rect.width) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  el.overlay.width = rect.width * dpr;
  el.overlay.height = rect.height * dpr;
  const context = el.overlay.getContext('2d');
  context.scale(dpr, dpr);
  const point = (index) => ({ x: offsetX + finalLandmarks[index].x * shownWidth, y: offsetY + finalLandmarks[index].y * shownHeight });
  context.lineWidth = 1.1;
  context.strokeStyle = 'rgba(32,79,116,.78)';
  for (const path of MESH_PATHS) {
    context.beginPath();
    path.forEach((index, position) => {
      const p = point(index);
      if (position === 0) context.moveTo(p.x, p.y);
      else context.lineTo(p.x, p.y);
    });
    context.stroke();
  }
  if (finalQuality?.raw?.occlusionRisk > 45) {
    context.strokeStyle = 'rgba(201,151,53,.98)';
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

function svgNode(name, attributes = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}
function pathData(points, width = 280, height = 350, close = false) {
  if (!points?.length) return '';
  const commands = points.map((point, index) => `${index ? 'L' : 'M'} ${(point.x * width + 20).toFixed(1)} ${(point.y * height + 20).toFixed(1)}`);
  if (close) commands.push('Z');
  return commands.join(' ');
}
function renderFaceAtlas() {
  const profile = combined.visualProfile;
  el.atlas.replaceChildren();
  if (!profile?.paths) return;
  const svg = svgNode('svg', { viewBox: '0 0 320 390', role: 'img', 'aria-label': 'Карта измеренных контуров лица' });
  svg.classList.add('atlas-svg');
  const defs = svgNode('defs');
  const gradient = svgNode('linearGradient', { id: 'faceWash', x1: '0', y1: '0', x2: '0', y2: '1' });
  gradient.append(svgNode('stop', { offset: '0%', 'stop-color': '#d7e4ec', 'stop-opacity': '.82' }), svgNode('stop', { offset: '100%', 'stop-color': '#efe1c8', 'stop-opacity': '.35' }));
  defs.append(gradient);
  svg.append(defs);
  const zones = { outline: ['outline', 'jaw'], eyes: ['leftEye', 'rightEye'], brows: ['leftBrow', 'rightBrow'], nose: ['nose'], lips: ['lips'], jaw: ['jaw'] };
  const outline = svgNode('path', { d: pathData(profile.paths.outline, 280, 350, true), class: 'atlas-outline', fill: 'url(#faceWash)', 'data-zone': 'outline' });
  svg.append(outline);
  const guideGroup = svgNode('g', { class: 'atlas-guides' });
  for (const y of [.36, .59, .76]) guideGroup.append(svgNode('line', { x1: 42, x2: 278, y1: 20 + y * 350, y2: 20 + y * 350 }));
  guideGroup.append(svgNode('line', { x1: 160, x2: 160, y1: 22, y2: 370 }));
  svg.append(guideGroup);
  for (const [zone, keys] of Object.entries(zones)) {
    for (const key of keys) {
      if (!profile.paths[key]) continue;
      svg.append(svgNode('path', {
        d: pathData(profile.paths[key], 280, 350, ['leftEye', 'rightEye', 'lips'].includes(key)),
        class: 'atlas-feature',
        'data-zone': zone
      }));
    }
  }
  el.atlas.append(svg);
  highlightAtlas(activeTraitZone);
}
function highlightAtlas(zone) {
  activeTraitZone = zone || 'outline';
  $$('[data-zone]', el.atlas).forEach((node) => node.classList.toggle('is-active', node.dataset.zone === activeTraitZone || (activeTraitZone === 'outline' && node.dataset.zone === 'jaw')));
  $$('.trait-card', el.traitList).forEach((card) => card.classList.toggle('is-active', card.dataset.zone === activeTraitZone));
}
function traitTitle(key) {
  return ({ faceShape: 'ФОРМА ЛИЦА', eyeShape: 'ФОРМА ГЛАЗ', eyeTilt: 'НАКЛОН ГЛАЗ', brows: 'БРОВИ', nose: 'НОС', lips: 'ГУБЫ', jaw: 'ЧЕЛЮСТЬ' })[key] || key;
}
function traitCard(item) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'trait-card';
  card.dataset.zone = item.zone;
  const heading = document.createElement('div');
  heading.className = 'trait-card-heading';
  const zone = document.createElement('span');
  zone.textContent = traitTitle(item.key);
  const confidence = document.createElement('small');
  confidence.textContent = `${item.confidence}% · ${item.stability ?? 100}% повтор`;
  heading.append(zone, confidence);
  const label = document.createElement('strong');
  label.textContent = item.label;
  const description = document.createElement('p');
  description.textContent = item.description;
  const evidence = document.createElement('b');
  evidence.textContent = item.evidence;
  card.append(heading, label, description, evidence);
  card.addEventListener('click', () => highlightAtlas(item.zone));
  return card;
}
function renderTraits() {
  el.traitList.replaceChildren(...(combined.traits || []).map(traitCard));
}
function renderRadar() {
  const entries = [
    ['Контур', combined.regionScores.outline], ['Глаза', combined.regionScores.eyes], ['Нос', combined.regionScores.nose],
    ['Губы', combined.regionScores.lips], ['Челюсть', combined.regionScores.jaw]
  ];
  const center = 120;
  const radius = 82;
  const polygon = (values) => values.map((value, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / values.length;
    const r = radius * value / 100;
    return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
  }).join(' ');
  const svg = svgNode('svg', { viewBox: '0 0 240 240', role: 'img', 'aria-label': 'Радар центральности пяти зон лица' });
  for (const level of [25, 50, 75, 100]) svg.append(svgNode('polygon', { points: polygon(entries.map(() => level)), class: 'radar-grid' }));
  entries.forEach(([,], index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / entries.length;
    svg.append(svgNode('line', { x1: center, y1: center, x2: center + Math.cos(angle) * radius, y2: center + Math.sin(angle) * radius, class: 'radar-axis' }));
  });
  svg.append(svgNode('polygon', { points: polygon(entries.map(([, value]) => value)), class: 'radar-shape' }));
  entries.forEach(([label], index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / entries.length;
    const text = svgNode('text', { x: center + Math.cos(angle) * 103, y: center + Math.sin(angle) * 103 + 4, class: 'radar-label', 'text-anchor': 'middle' });
    text.textContent = label;
    svg.append(text);
  });
  el.radar.replaceChildren(svg);
  el.radarLegend.textContent = 'Радар показывает близость к центральным пропорциям, а не «качество» отдельных черт.';
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
  requestAnimationFrame(() => { fill.style.width = `${clamp(value, 0, 100)}%`; });
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
  confidence.textContent = `${feature.confidence}% уверенность`;
  top.append(zone, confidence);
  const title = document.createElement('strong');
  title.textContent = feature.label;
  const status = document.createElement('p');
  status.textContent = feature.title;
  const scale = document.createElement('div');
  scale.className = 'deviation-scale';
  const centerBand = document.createElement('i');
  centerBand.className = 'center-band';
  const marker = document.createElement('b');
  marker.style.left = `${clamp(50 + feature.signedZ * 17, 4, 96)}%`;
  scale.append(centerBand, marker);
  const delta = document.createElement('em');
  const percent = Math.round(Math.abs(feature.value / Math.max(.0001, feature.center) - 1) * 100);
  delta.textContent = feature.z < .25 ? '≈ центральное значение' : `${feature.signedZ > 0 ? '+' : '−'}${Math.max(1, percent)}% относительно центра`;
  card.append(top, title, status, scale, delta);
  return card;
}
function renderTakeaways() {
  const traits = combined.traits || [];
  const stableTraits = traits.filter((item) => (item.stability ?? 100) >= 67).sort((a, b) => b.confidence - a.confidence);
  const distinctive = [...(combined.featureDetails || [])].sort((a, b) => b.z - a.z);
  const lines = [
    stableTraits[0] ? `${traitTitle(stableTraits[0].key)}: ${stableTraits[0].label.toLowerCase()}.` : null,
    stableTraits[1] ? `${traitTitle(stableTraits[1].key)}: ${stableTraits[1].label.toLowerCase()}.` : null,
    distinctive[0] ? `Наиболее выраженное отклонение: ${distinctive[0].label.toLowerCase()}.` : null
  ].filter(Boolean);
  el.takeaways.replaceChildren(...lines.map((text) => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
}
function renderFrameEvidence() {
  el.frameEvidence.replaceChildren(...scans.map((scan, index) => {
    const item = document.createElement('article');
    item.className = 'frame-evidence-item';
    const interval = index === 0
      ? 'старт'
      : scan.capture.source === 'camera'
        ? `${((scan.capture.capturedAt - scans[index - 1].capture.capturedAt) / 1000).toFixed(1)} с`
        : 'не проверен';
    item.innerHTML = `
      <div class="frame-index">${String(index + 1).padStart(2, '0')}</div>
      <div><span>надёжность</span><strong>${scan.reliability}%</strong></div>
      <div><span>фронтальность</span><strong>${scan.capture.frontal}%</strong></div>
      <div><span>видимость</span><strong>${scan.capture.visibility}%</strong></div>
      <div><span>интервал</span><strong>${interval}</strong></div>`;
    return item;
  }));
}
function renderIssues() {
  const unique = [];
  const seen = new Set();
  for (const issue of combined.issues || []) {
    if (!seen.has(issue.key)) {
      seen.add(issue.key);
      unique.push(issue);
    }
  }
  if (!unique.length) {
    const row = document.createElement('div');
    row.className = 'issue-row is-ok';
    row.textContent = 'Все три кадра прошли обязательную проверку качества.';
    el.issues.replaceChildren(row);
    return;
  }
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
function renderResult() {
  el.resultMode.textContent = 'ПРОВЕРЕНО · 3 КАДРА';
  el.score.textContent = combined.rating.toFixed(1);
  el.range.textContent = `${combined.interval[0].toFixed(1)}–${combined.interval[1].toFixed(1)}`;
  el.label.textContent = ratingLabel(combined.rating);
  el.reliability.textContent = `${combined.reliability}%`;
  el.consistency.textContent = `${combined.consistency}%`;
  el.typicality.textContent = `${combined.typicalityPercentile}%`;
  el.occlusion.textContent = `${combined.occlusionScore}%`;
  el.protocol.textContent = combined.protocolShort;
  const intervalText = combined.timingVerified
    ? combined.intervals.map((value) => `${(value / 1000).toFixed(1)} с`).join(' · ')
    : 'интервал исходных файлов нельзя подтвердить';
  el.stabilityNote.textContent = `${combined.protocolLabel}. Интервалы: ${intervalText}. Итог — медиана трёх оценок; разброс контуров расширяет диапазон.`;
  renderFrameEvidence();
  renderFaceAtlas();
  renderTraits();
  renderTakeaways();
  renderRadar();
  el.metrics.replaceChildren(
    metric('Типичность пропорций', combined.typicalityPercentile),
    metric('Координация черт', combined.coordinationScore),
    metric('Левый / правый баланс', combined.symmetryScore),
    metric('Открытость лица', combined.occlusionScore),
    metric('Повторяемость геометрии', combined.geometryConsistency)
  );
  el.featureDetails.replaceChildren(...(combined.featureDetails || []).map(featureCard));
  renderIssues();
}

function saveResult() {
  if (resultSaved || !combined) return;
  const history = store.get('history', []);
  history.unshift({
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    createdAt: new Date().toISOString(),
    rating: +combined.rating.toFixed(2),
    interval: combined.interval.map((value) => +value.toFixed(2)),
    scanCount: REQUIRED_FRAMES,
    reliability: combined.reliability,
    consistency: combined.consistency,
    protocol: combined.protocolShort,
    source: combined.source
  });
  store.set('history', history.slice(0, 24));
  resultSaved = true;
  renderHistory();
}
function dateLabel(iso) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
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
    item.innerHTML = `<div class="history-score">${Number(entry.rating).toFixed(1)}</div><div class="history-meta"><strong>3 кадра · ${entry.protocol || 'серия'}</strong><span>${dateLabel(entry.createdAt)}</span></div><div class="history-range">${Number(entry.interval[0]).toFixed(1)}–${Number(entry.interval[1]).toFixed(1)}</div>`;
    return item;
  }));
}
async function share() {
  if (!combined || !finalized) return;
  const text = `FACET: ${combined.rating.toFixed(1)}/5, диапазон ${combined.interval[0].toFixed(1)}–${combined.interval[1].toFixed(1)}, 3 проверенных кадра, повторяемость ${combined.consistency}%.`;
  try {
    if (navigator.share) await navigator.share({ title: 'FACET', text });
    else {
      await navigator.clipboard.writeText(text);
      toast('Результат скопирован.');
    }
  } catch (error) {
    if (error?.name !== 'AbortError') toast('Не удалось поделиться.');
  }
}

el.consent.addEventListener('change', () => {
  store.set('consented', el.consent.checked);
  setConsent(el.consent.checked);
});
el.cameraOpen.addEventListener('click', startCamera);
el.file.addEventListener('change', () => runGallerySeries(el.file.files || []));
el.cameraClose.addEventListener('click', cancelCameraSession);
el.shutter.addEventListener('click', runCameraSeries);
el.cameraFlip.addEventListener('click', async () => {
  if (sessionRunning) return;
  cameraFacing = cameraFacing === 'user' ? 'environment' : 'user';
  cameraDeviceId = null;
  stopCamera();
  try {
    cameraStream = await openCameraStream();
    el.video.srcObject = cameraStream;
    await el.video.play();
    el.video.classList.toggle('is-mirrored', cameraFacing === 'user');
    requestAnimationFrame(drawCameraGuide);
  } catch {
    toast('Не удалось переключить камеру.');
  }
});
el.cameraFov.addEventListener('click', () => {
  if (sessionRunning) return;
  cameraFov = cameraFov === 'standard' ? 'wide' : 'standard';
  store.set('cameraFov', cameraFov);
  updateCameraFovUi();
});
el.cameraDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  cancelCameraSession();
});
el.cameraDialog.addEventListener('close', () => {
  if (!sessionRunning) stopCamera();
});
el.reset.addEventListener('click', () => {
  resetAll();
  el.capture.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
el.share.addEventListener('click', share);
el.method.addEventListener('click', () => openDialog(el.methodDialog));
el.history.addEventListener('click', () => { renderHistory(); openDialog(el.historyDialog); });
el.historyClear.addEventListener('click', () => {
  if (store.get('history', []).length && confirm('Удалить историю?')) {
    store.set('history', []);
    renderHistory();
  }
});
$$('[data-dialog-close]').forEach((button) => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));
for (const dialog of [el.methodDialog, el.historyDialog]) {
  dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(dialog); });
}
window.addEventListener('resize', () => {
  drawOverlay();
  if (el.cameraDialog.open) drawCameraGuide();
});
if ('ResizeObserver' in window) new ResizeObserver(drawOverlay).observe(el.stage);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && el.cameraDialog.open) cancelCameraSession();
});
window.addEventListener('appdatareset', () => {
  store.reset();
  resetAll();
  setConsent(false);
  renderHistory();
});

setConsent(store.get('consented', false));
renderProgress();
renderSessionFrames();
renderHistory();
updateCameraFovUi();
setModel(online ? 'idle' : 'error', online ? 'модель не загружена' : 'нужна сеть');
