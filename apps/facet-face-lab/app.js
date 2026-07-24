import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  blendshapeMap,
  boundingBoxFromLandmarks,
  computeGeometryProfile,
  computeImageQuality,
  createAssessment,
  qualityGate
} from './analysis-engine.js';

installMobileRuntime();

const APP_NAME = 'FACET — анализ лица';
const APP_VERSION = '1.0.0';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODULE_URLS = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/+esm',
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs'
];
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_HISTORY = 24;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const elements = {
  consentCheck: $('#consent-check'),
  capturePanel: $('#capture-panel'),
  cameraOpen: $('#camera-open'),
  fileInput: $('#file-input'),
  uploadLabel: $('#upload-label'),
  photoStage: $('#photo-stage'),
  emptyPhoto: $('#empty-photo'),
  sourceImage: $('#source-image'),
  overlayCanvas: $('#overlay-canvas'),
  replacePhoto: $('#replace-photo'),
  analyzeButton: $('#analyze-button'),
  analyzeLabel: $('.analyze-label'),
  modelStatus: $('#model-status'),
  qualityPreview: $('#quality-preview'),
  qualityGrid: $('#quality-grid'),
  qualityLiveLabel: $('#quality-live-label'),
  resultPanel: $('#result-panel'),
  scoreValue: $('#score-value'),
  scoreInterval: $('#score-interval'),
  reliabilityStamp: $('#reliability-stamp'),
  metricList: $('#metric-list'),
  strongList: $('#strong-list'),
  distinctiveList: $('#distinctive-list'),
  presentationScore: $('#presentation-score'),
  qualityCaption: $('#quality-report-caption'),
  issueList: $('#issue-list'),
  shareResult: $('#share-result'),
  reanalyzeButton: $('#reanalyze-button'),
  methodOpen: $('#method-open'),
  methodFromResult: $('#method-from-result'),
  methodDialog: $('#method-dialog'),
  historyOpen: $('#history-open'),
  historyDialog: $('#history-dialog'),
  historyList: $('#history-list'),
  historyClear: $('#history-clear'),
  cameraDialog: $('#camera-dialog'),
  cameraClose: $('#camera-close'),
  cameraVideo: $('#camera-video'),
  cameraGuide: $('#camera-guide'),
  cameraMessage: $('#camera-message'),
  cameraCapture: $('#camera-capture'),
  cameraFlip: $('#camera-flip'),
  workCanvas: $('#work-canvas'),
  toast: $('#toast')
};

const store = createVersionedStore({
  namespace: 'pocket-works:facet-face-lab',
  version: 1,
  defaults: {
    consented: false,
    history: [],
    saveHistory: true,
    haptics: true
  },
  validate(value) {
    return Boolean(value && typeof value === 'object' && Array.isArray(value.history));
  }
});

let objectUrl = null;
let faceLandmarker = null;
let modelPromise = null;
let currentLandmarks = null;
let currentAssessment = null;
let currentQuality = null;
let currentFaceBox = null;
let cameraStream = null;
let cameraFacing = 'user';
let toastTimer = 0;
let online = navigator.onLine;

createWorkshopMode({
  appName: APP_NAME,
  version: APP_VERSION,
  cachePrefix: 'facet-face-lab-',
  storageNamespace: 'pocket-works:facet-face-lab',
  onReset() {
    store.reset();
    resetPhoto();
    applyConsent(false);
    renderHistory();
  }
});

watchConnectivity((isOnline) => {
  online = isOnline;
  document.documentElement.dataset.network = online ? 'online' : 'offline';
  if (!online && !faceLandmarker) setModelStatus('error', 'нужна сеть для первого запуска');
  if (online && !faceLandmarker && elements.modelStatus.dataset.status === 'error') setModelStatus('idle', 'модель не загружена');
});

function haptic(pattern = 12) {
  if (store.get('haptics', true) && navigator.vibrate) navigator.vibrate(pattern);
}

function showToast(message, duration = 3200) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => elements.toast.classList.remove('is-visible'), duration);
}

function setModelStatus(status, text) {
  elements.modelStatus.dataset.status = status;
  $('span', elements.modelStatus).textContent = text;
}

function setLoading(isLoading, label = 'Провести анализ') {
  elements.analyzeButton.classList.toggle('is-loading', isLoading);
  elements.analyzeButton.disabled = isLoading || !elements.sourceImage.src;
  elements.analyzeLabel.textContent = isLoading ? label : 'Провести анализ';
  elements.photoStage.dataset.state = isLoading ? 'scanning' : (currentLandmarks ? 'analyzed' : elements.sourceImage.src ? 'ready' : 'empty');
}

function applyConsent(consented) {
  elements.consentCheck.checked = consented;
  elements.capturePanel.classList.toggle('is-locked', !consented);
  elements.cameraOpen.disabled = !consented;
  elements.fileInput.disabled = !consented;
  elements.uploadLabel.setAttribute('aria-disabled', String(!consented));
}

function safeDialogOpen(dialog) {
  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
}

function safeDialogClose(dialog) {
  if (typeof dialog.close === 'function' && dialog.open) dialog.close();
  else dialog.removeAttribute('open');
}

function timeoutPromise(promise, milliseconds, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function importVisionModule() {
  let lastError = null;
  for (const url of MODULE_URLS) {
    try {
      const module = await timeoutPromise(import(url), 22000, 'Загрузка библиотеки превысила лимит времени');
      if (module.FaceLandmarker && module.FilesetResolver) return module;
      throw new Error('Модуль MediaPipe загружен без ожидаемых экспортов');
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Не удалось загрузить MediaPipe');
}

async function ensureModel() {
  if (faceLandmarker) return faceLandmarker;
  if (modelPromise) return modelPromise;
  if (!online) throw new Error('Первый запуск модели требует подключения к интернету');

  setModelStatus('loading', 'загрузка модели');
  modelPromise = (async () => {
    const { FaceLandmarker, FilesetResolver } = await importVisionModule();
    const vision = await timeoutPromise(
      FilesetResolver.forVisionTasks(WASM_ROOT),
      26000,
      'Не удалось подготовить вычислительное ядро'
    );
    faceLandmarker = await timeoutPromise(
      FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: 'CPU'
        },
        runningMode: 'IMAGE',
        numFaces: 2,
        minFaceDetectionConfidence: 0.65,
        minFacePresenceConfidence: 0.65,
        minTrackingConfidence: 0.65,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false
      }),
      42000,
      'Загрузка модели лица превысила лимит времени'
    );
    setModelStatus('ready', 'модель готова');
    return faceLandmarker;
  })().catch((error) => {
    faceLandmarker = null;
    modelPromise = null;
    setModelStatus('error', 'ошибка загрузки');
    throw error;
  });
  return modelPromise;
}

function clearObjectUrl() {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
}

function resetPhoto() {
  clearObjectUrl();
  currentLandmarks = null;
  currentAssessment = null;
  currentQuality = null;
  currentFaceBox = null;
  elements.sourceImage.removeAttribute('src');
  elements.sourceImage.hidden = true;
  elements.emptyPhoto.hidden = false;
  elements.replacePhoto.hidden = true;
  elements.analyzeButton.disabled = true;
  elements.photoStage.dataset.state = 'empty';
  elements.qualityPreview.hidden = true;
  elements.resultPanel.hidden = true;
  elements.fileInput.value = '';
  clearOverlay();
}

function drawImageToWorkCanvas(maxDimension = 1024) {
  const image = elements.sourceImage;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  elements.workCanvas.width = width;
  elements.workCanvas.height = height;
  const context = elements.workCanvas.getContext('2d', { willReadFrequently: true });
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return context;
}

function basicPhotoChecks() {
  const context = drawImageToWorkCanvas(720);
  const { width, height } = elements.workCanvas;
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  const step = Math.max(4, Math.floor(data.length / 180000) * 4);
  let count = 0;
  let sum = 0;
  let sumSq = 0;
  let clipping = 0;
  for (let index = 0; index < data.length; index += step) {
    const gray = data[index] * .2126 + data[index + 1] * .7152 + data[index + 2] * .0722;
    count += 1;
    sum += gray;
    sumSq += gray * gray;
    if (gray < 10 || gray > 245) clipping += 1;
  }
  const mean = sum / Math.max(1, count);
  const contrast = Math.sqrt(Math.max(0, sumSq / Math.max(1, count) - mean * mean));
  const resolution = Math.min(elements.sourceImage.naturalWidth, elements.sourceImage.naturalHeight);
  const items = [
    { label: 'Разрешение', value: `${elements.sourceImage.naturalWidth}×${elements.sourceImage.naturalHeight}`, state: resolution >= 720 ? 'good' : resolution >= 480 ? 'warn' : 'bad' },
    { label: 'Экспозиция', value: mean > 55 && mean < 210 ? 'норма' : 'проверь свет', state: mean > 55 && mean < 210 ? 'good' : 'warn' },
    { label: 'Контраст', value: contrast > 28 ? 'достаточный' : 'низкий', state: contrast > 28 ? 'good' : 'warn' },
    { label: 'Пересвет', value: clipping / Math.max(1, count) < .12 ? 'минимальный' : 'заметный', state: clipping / Math.max(1, count) < .12 ? 'good' : 'warn' }
  ];
  renderQualityGrid(items);
  elements.qualityLiveLabel.textContent = 'готово к геометрии';
  elements.qualityPreview.hidden = false;
}

function renderQualityGrid(items) {
  elements.qualityGrid.replaceChildren(...items.map((item) => {
    const node = document.createElement('div');
    node.className = 'quality-item';
    node.dataset.state = item.state;
    const label = document.createElement('span');
    label.textContent = item.label;
    const value = document.createElement('strong');
    value.textContent = item.value;
    node.append(label, value);
    return node;
  }));
}

async function loadBlob(blob) {
  if (!blob) return;
  if (blob.size > MAX_FILE_BYTES) {
    showToast('Файл слишком большой. Максимум — 20 МБ.');
    return;
  }
  if (blob.type && !blob.type.startsWith('image/')) {
    showToast('Нужен файл изображения.');
    return;
  }

  resetPhoto();
  objectUrl = URL.createObjectURL(blob);
  elements.sourceImage.src = objectUrl;

  try {
    const decodeImage = typeof elements.sourceImage.decode === 'function'
      ? elements.sourceImage.decode()
      : new Promise((resolve, reject) => {
          elements.sourceImage.addEventListener('load', resolve, { once: true });
          elements.sourceImage.addEventListener('error', reject, { once: true });
        });
    await timeoutPromise(decodeImage, 15000, 'Браузер не смог декодировать изображение');
  } catch (error) {
    resetPhoto();
    showToast('Формат изображения не поддерживается. Экспортируй фото в JPEG или PNG.');
    return;
  }

  if (Math.min(elements.sourceImage.naturalWidth, elements.sourceImage.naturalHeight) < 360) {
    showToast('Слишком маленькое изображение: желательно хотя бы 720 пикселей по короткой стороне.');
  }
  currentLandmarks = null;
  currentAssessment = null;
  currentQuality = null;
  currentFaceBox = null;
  elements.emptyPhoto.hidden = true;
  elements.sourceImage.hidden = false;
  elements.replacePhoto.hidden = false;
  elements.analyzeButton.disabled = false;
  elements.photoStage.dataset.state = 'ready';
  elements.resultPanel.hidden = true;
  basicPhotoChecks();
  requestAnimationFrame(drawOverlay);
  haptic(10);
}

function getContainRect() {
  const stageRect = elements.photoStage.getBoundingClientRect();
  const image = elements.sourceImage;
  if (!image.naturalWidth || !image.naturalHeight) return null;
  const scale = Math.min(stageRect.width / image.naturalWidth, stageRect.height / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  return {
    x: (stageRect.width - width) / 2,
    y: (stageRect.height - height) / 2,
    width,
    height,
    stageWidth: stageRect.width,
    stageHeight: stageRect.height
  };
}

function clearOverlay() {
  const canvas = elements.overlayCanvas;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
}

function drawOverlay() {
  const canvas = elements.overlayCanvas;
  const rect = getContainRect();
  if (!rect) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(rect.stageWidth * dpr));
  canvas.height = Math.max(1, Math.round(rect.stageHeight * dpr));
  canvas.style.width = `${rect.stageWidth}px`;
  canvas.style.height = `${rect.stageHeight}px`;
  const context = canvas.getContext('2d');
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, rect.stageWidth, rect.stageHeight);
  if (!currentLandmarks) return;

  const point = (index) => ({
    x: rect.x + currentLandmarks[index].x * rect.width,
    y: rect.y + currentLandmarks[index].y * rect.height
  });
  const paths = [
    [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10],
    [33, 160, 158, 133, 153, 144, 33],
    [263, 387, 385, 362, 380, 373, 263],
    [61, 40, 37, 0, 267, 270, 291, 321, 314, 17, 84, 91, 61]
  ];

  context.lineWidth = 1.15;
  context.strokeStyle = 'rgba(226,173,60,.92)';
  context.fillStyle = 'rgba(36,90,134,.95)';
  for (const path of paths) {
    context.beginPath();
    path.forEach((index, position) => {
      const p = point(index);
      if (position === 0) context.moveTo(p.x, p.y);
      else context.lineTo(p.x, p.y);
    });
    context.stroke();
  }

  const keyPoints = [10, 152, 234, 454, 33, 133, 362, 263, 1, 98, 327, 61, 291, 70, 300];
  for (const index of keyPoints) {
    const p = point(index);
    context.beginPath();
    context.arc(p.x, p.y, 2.25, 0, Math.PI * 2);
    context.fill();
  }

  const top = point(10);
  const chin = point(152);
  context.setLineDash([7, 6]);
  context.strokeStyle = 'rgba(36,90,134,.72)';
  context.beginPath();
  context.moveTo(top.x, top.y - 12);
  context.lineTo(chin.x, chin.y + 12);
  context.stroke();
  context.setLineDash([]);
}

function drawCameraGuide() {
  const canvas = elements.cameraGuide;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const context = canvas.getContext('2d');
  context.scale(dpr, dpr);
  context.clearRect(0, 0, rect.width, rect.height);
  const cx = rect.width / 2;
  const cy = rect.height * .45;
  const rx = Math.min(rect.width * .28, rect.height * .22);
  const ry = rx * 1.35;
  context.strokeStyle = 'rgba(255,255,255,.8)';
  context.lineWidth = 1.5;
  context.setLineDash([10, 8]);
  context.beginPath();
  context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);
  context.strokeStyle = 'rgba(226,173,60,.9)';
  context.beginPath();
  context.moveTo(cx - rx * 1.25, cy - ry * .16);
  context.lineTo(cx + rx * 1.25, cy - ry * .16);
  context.stroke();
  context.beginPath();
  context.moveTo(cx, cy - ry * 1.1);
  context.lineTo(cx, cy + ry * 1.1);
  context.stroke();
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast('Эта версия браузера не даёт приложению доступ к камере. Выбери фото из галереи.');
    return;
  }
  safeDialogOpen(elements.cameraDialog);
  elements.cameraCapture.disabled = true;
  elements.cameraMessage.textContent = 'Запрашиваю доступ к камере…';
  stopCamera();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: cameraFacing },
        width: { ideal: 1280 },
        height: { ideal: 1600 }
      }
    });
    elements.cameraVideo.srcObject = cameraStream;
    await elements.cameraVideo.play();
    elements.cameraVideo.style.transform = cameraFacing === 'user' ? 'scaleX(-1)' : 'none';
    elements.cameraCapture.disabled = false;
    elements.cameraMessage.textContent = 'Смотри прямо в объектив · мягкий свет · без фильтров';
    requestAnimationFrame(drawCameraGuide);
  } catch (error) {
    elements.cameraMessage.textContent = 'Камера недоступна. Проверь разрешение в настройках браузера.';
    elements.cameraCapture.disabled = true;
  }
}

function stopCamera() {
  if (cameraStream) {
    for (const track of cameraStream.getTracks()) track.stop();
  }
  cameraStream = null;
  elements.cameraVideo.srcObject = null;
}

async function captureCameraFrame() {
  if (!cameraStream || !elements.cameraVideo.videoWidth) return;
  const video = elements.cameraVideo;
  const maxWidth = 1440;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const width = Math.round(video.videoWidth * scale);
  const height = Math.round(video.videoHeight * scale);
  const canvas = elements.workCanvas;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (cameraFacing === 'user') {
    context.translate(width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(video, 0, 0, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .92));
  stopCamera();
  safeDialogClose(elements.cameraDialog);
  if (blob) await loadBlob(blob);
}

function resultError(message, details = '') {
  elements.qualityLiveLabel.textContent = 'кадр отклонён';
  if (details) showToast(`${message} ${details}`, 4600);
  else showToast(message, 4600);
  haptic([20, 40, 20]);
}

function qualityGridAfterAnalysis(quality) {
  const state = (value) => value >= 72 ? 'good' : value >= 48 ? 'warn' : 'bad';
  renderQualityGrid([
    { label: 'Резкость', value: Math.round(quality.metrics.sharpness), state: state(quality.metrics.sharpness) },
    { label: 'Освещение', value: Math.round((quality.metrics.exposure + quality.metrics.clipping) / 2), state: state((quality.metrics.exposure + quality.metrics.clipping) / 2) },
    { label: 'Фронтальность', value: Math.round(quality.metrics.frontal), state: state(quality.metrics.frontal) },
    { label: 'Надёжность', value: Math.round(quality.reliability), state: state(quality.reliability) }
  ]);
  elements.qualityLiveLabel.textContent = quality.reliability >= 76 ? 'надёжный кадр' : quality.reliability >= 58 ? 'допустимый кадр' : 'кадр отклонён';
}

async function analyzeCurrentPhoto() {
  if (!elements.sourceImage.src) return;
  setLoading(true, 'Подготовка модели…');
  elements.resultPanel.hidden = true;
  currentLandmarks = null;
  clearOverlay();

  try {
    const model = await ensureModel();
    setLoading(true, 'Поиск ориентиров…');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const result = model.detect(elements.sourceImage);
    const faces = result.faceLandmarks || [];
    if (faces.length === 0) {
      resultError('Лицо не найдено.', 'Убери фильтры, увеличь лицо в кадре и попробуй снова.');
      return;
    }
    if (faces.length > 1) {
      resultError('В кадре найдено несколько лиц.', 'FACET анализирует только одного человека за раз.');
      return;
    }

    currentLandmarks = faces[0];
    currentFaceBox = boundingBoxFromLandmarks(currentLandmarks);
    const geometry = computeGeometryProfile(currentLandmarks);
    const categories = result.faceBlendshapes?.[0]?.categories || [];
    const shapes = blendshapeMap(categories);
    const context = drawImageToWorkCanvas(960);
    const imageData = context.getImageData(0, 0, elements.workCanvas.width, elements.workCanvas.height);
    currentQuality = computeImageQuality(imageData, currentFaceBox, geometry, shapes);
    qualityGridAfterAnalysis(currentQuality);
    drawOverlay();

    const gate = qualityGate(currentQuality);
    if (!gate.pass) {
      resultError(gate.reason, currentQuality.issues[0]?.fix || 'Сделай новый снимок.');
      return;
    }

    currentAssessment = createAssessment(geometry, currentQuality);
    renderAssessment(currentAssessment);
    saveAssessment(currentAssessment);
    elements.photoStage.dataset.state = 'analyzed';
    elements.resultPanel.hidden = false;
    haptic([12, 30, 18]);
    window.setTimeout(() => elements.resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  } catch (error) {
    console.error('FACET analysis failed', error);
    resultError('Анализ не выполнен.', error?.message || 'Неизвестная ошибка модели.');
  } finally {
    setLoading(false);
  }
}

function metricRow(label, value) {
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
  requestAnimationFrame(() => { fill.style.width = `${value}%`; });
  return row;
}

function renderFeatureList(target, items) {
  target.replaceChildren(...items.map((item) => {
    const li = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = item.label;
    const score = document.createElement('strong');
    score.textContent = `${item.score}/100`;
    li.append(text, score);
    return li;
  }));
}

function renderAssessment(assessment) {
  elements.scoreValue.textContent = String(assessment.pointEstimate);
  elements.scoreInterval.textContent = `${assessment.interval[0]}–${assessment.interval[1]}`;
  elements.reliabilityStamp.dataset.level = assessment.reliability >= 82 ? 'high' : assessment.reliability >= 66 ? 'medium' : 'low';
  $('strong', elements.reliabilityStamp).textContent = `${assessment.reliability}/100 · ${assessment.reliabilityLabel}`;
  elements.metricList.replaceChildren(
    metricRow('Пропорциональная регулярность', assessment.components.proportionalRegularity),
    metricRow('Координация признаков', assessment.components.featureCoordination),
    metricRow('Билатеральный баланс', assessment.components.bilateralBalance)
  );
  renderFeatureList(elements.strongList, assessment.strongest);
  renderFeatureList(elements.distinctiveList, assessment.mostDistinctive);
  elements.presentationScore.textContent = `${assessment.presentationScore}/100`;
  elements.qualityCaption.textContent = assessment.reliability >= 82
    ? 'Кадр подходит для повторяемого измерения.'
    : 'Кадр допустим, но повтор с более ровным светом может изменить результат.';

  if (assessment.issues.length === 0) {
    const row = document.createElement('div');
    row.className = 'issue-row';
    row.dataset.severity = 'ok';
    row.innerHTML = '<i></i><div><strong>Критических проблем не найдено</strong><span>Ракурс, свет и резкость прошли автоматическую проверку.</span></div>';
    elements.issueList.replaceChildren(row);
  } else {
    elements.issueList.replaceChildren(...assessment.issues.slice(0, 4).map((issue) => {
      const row = document.createElement('div');
      row.className = 'issue-row';
      row.dataset.severity = issue.severity;
      const dot = document.createElement('i');
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = issue.title;
      const fix = document.createElement('span');
      fix.textContent = issue.fix;
      copy.append(title, fix);
      row.append(dot, copy);
      return row;
    }));
  }
}

function saveAssessment(assessment) {
  if (!store.get('saveHistory', true)) return;
  const history = store.get('history', []);
  history.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    score: assessment.pointEstimate,
    interval: assessment.interval,
    reliability: assessment.reliability,
    components: assessment.components
  });
  store.set('history', history.slice(0, MAX_HISTORY));
  renderHistory();
}

function formatDate(iso) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function renderHistory() {
  const history = store.get('history', []);
  elements.historyClear.disabled = history.length === 0;
  if (history.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'Измерений пока нет.';
    elements.historyList.replaceChildren(empty);
    return;
  }
  elements.historyList.replaceChildren(...history.map((entry) => {
    const item = document.createElement('article');
    item.className = 'history-item';
    const score = document.createElement('div');
    score.className = 'history-score';
    score.textContent = String(entry.score);
    const meta = document.createElement('div');
    meta.className = 'history-meta';
    const title = document.createElement('strong');
    title.textContent = `Надёжность ${entry.reliability}/100`;
    const date = document.createElement('span');
    date.textContent = formatDate(entry.createdAt);
    meta.append(title, date);
    const range = document.createElement('div');
    range.className = 'history-range';
    range.textContent = `${entry.interval[0]}–${entry.interval[1]}`;
    item.append(score, meta, range);
    return item;
  }));
}

async function shareAssessment() {
  if (!currentAssessment) return;
  const text = `FACET: структурный индекс ${currentAssessment.pointEstimate}/100, диапазон ${currentAssessment.interval[0]}–${currentAssessment.interval[1]}, надёжность кадра ${currentAssessment.reliability}/100. Это не процентиль и не объективный вердикт.`;
  try {
    if (navigator.share) await navigator.share({ title: 'Результат FACET', text });
    else {
      await navigator.clipboard.writeText(text);
      showToast('Результат скопирован.');
    }
  } catch (error) {
    if (error?.name !== 'AbortError') showToast('Не удалось поделиться результатом.');
  }
}

function openMethod() { safeDialogOpen(elements.methodDialog); }
function openHistory() { renderHistory(); safeDialogOpen(elements.historyDialog); }

elements.consentCheck.addEventListener('change', () => {
  const consented = elements.consentCheck.checked;
  store.set('consented', consented);
  applyConsent(consented);
  if (consented) haptic(10);
});

elements.fileInput.addEventListener('change', async () => {
  const file = elements.fileInput.files?.[0];
  await loadBlob(file);
});

elements.cameraOpen.addEventListener('click', startCamera);
elements.cameraClose.addEventListener('click', () => { stopCamera(); safeDialogClose(elements.cameraDialog); });
elements.cameraCapture.addEventListener('click', captureCameraFrame);
elements.cameraFlip.addEventListener('click', async () => {
  cameraFacing = cameraFacing === 'user' ? 'environment' : 'user';
  await startCamera();
});
elements.cameraDialog.addEventListener('close', stopCamera);
elements.cameraDialog.addEventListener('cancel', stopCamera);

elements.replacePhoto.addEventListener('click', () => elements.fileInput.click());
elements.reanalyzeButton.addEventListener('click', () => {
  resetPhoto();
  elements.capturePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
elements.analyzeButton.addEventListener('click', analyzeCurrentPhoto);
elements.shareResult.addEventListener('click', shareAssessment);
elements.methodOpen.addEventListener('click', openMethod);
elements.methodFromResult.addEventListener('click', openMethod);
elements.historyOpen.addEventListener('click', openHistory);
$$('[data-dialog-close]').forEach((button) => button.addEventListener('click', () => safeDialogClose(button.closest('dialog'))));

elements.historyClear.addEventListener('click', () => {
  if (!store.get('history', []).length) return;
  if (!window.confirm('Удалить всю локальную историю измерений?')) return;
  store.set('history', []);
  renderHistory();
  showToast('История очищена.');
});

for (const dialog of [elements.methodDialog, elements.historyDialog]) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) safeDialogClose(dialog);
  });
}

window.addEventListener('resize', () => {
  drawOverlay();
  if (elements.cameraDialog.open) drawCameraGuide();
});
if ('ResizeObserver' in window) {
  new ResizeObserver(drawOverlay).observe(elements.photoStage);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && elements.cameraDialog.open) {
    stopCamera();
    safeDialogClose(elements.cameraDialog);
  }
});

window.addEventListener('appdatareset', () => {
  store.reset();
  resetPhoto();
  applyConsent(false);
  renderHistory();
});

applyConsent(store.get('consented', false));
renderHistory();
setModelStatus(online ? 'idle' : 'error', online ? 'модель не загружена' : 'нужна сеть для первого запуска');
