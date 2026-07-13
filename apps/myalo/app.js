import { capturePointer, installMobileRuntime, releasePointer } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import { ElasticRenderer } from './elastic-renderer.js';
import {
  HAND_CONNECTIONS,
  createFeatureNodes,
  grabFeature,
  moveGrabbedFeature,
  nearestFeature,
  releaseFeature,
  stepFeaturePhysics,
  updateFeatureTargets
} from './feature-map.js';
import { MyaloAudio } from './audio.js';

const APP_VERSION = '1.2.0';
const STORAGE_KEY = 'pocket-works:myalo:preferences';
const TRACK_INTERVAL = 1000 / 18;
const FACE_FADE_MS = 850;
const MODEL_CACHE = 'myalo-v1.2.0';
const MODEL_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs',
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
];

installMobileRuntime();

const mirror = document.querySelector('#mirror');
const video = document.querySelector('#camera');
const scene = document.querySelector('#scene');
const overlay = document.querySelector('#overlay');
const startup = document.querySelector('#startup');
const startButton = document.querySelector('#start-button');
const retryButton = document.querySelector('#retry-button');
const permissionError = document.querySelector('#permission-error');
const errorTitle = document.querySelector('#error-title');
const errorCopy = document.querySelector('#error-copy');
const loadingRail = document.querySelector('#loading-rail');
const loadingLabel = document.querySelector('#loading-label');
const loadingFill = document.querySelector('#loading-fill');
const liveStatus = document.querySelector('#live-status');
const statusCopy = document.querySelector('#status-copy');
const instruction = document.querySelector('#instruction');
const instructionCopy = document.querySelector('#instruction-copy');
const pointsToggle = document.querySelector('#points-toggle');
const soundToggle = document.querySelector('#sound-toggle');

const preferences = loadPreferences();
const nodes = createFeatureNodes();
const audio = new MyaloAudio(preferences.sound);
const handStates = new Map();
const inferenceDurations = [];

let renderer = null;
let tracker = null;
let cameraStream = null;
let processorCanvas = null;
let processorContext = null;
let processorWidth = 384;
let workerReady = false;
let workerBusy = false;
let running = false;
let starting = false;
let lastFrameSentAt = 0;
let lastTrackingVideoTime = -1;
let lastRenderAt = performance.now();
let lastOverlayAt = 0;
let lastFaceAt = 0;
let latestFace = [];
let latestHands = [];
let latestHandedness = [];
let directGrab = null;
let hadFace = false;
let online = navigator.onLine;
let reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let animationFrame = 0;

const workshop = createWorkshopMode({
  appName: 'МЯЛО',
  version: APP_VERSION,
  cachePrefix: 'myalo-',
  storageNamespace: 'pocket-works:myalo',
  onReset: async () => window.location.reload()
});

try {
  renderer = new ElasticRenderer(scene, video);
} catch (error) {
  workshop.recordError?.(error, 'renderer');
  showFatal('WebGL недоступен', 'Для живой деформации нужен WebGL. Открой приложение без режима энергосбережения.');
}

pointsToggle.setAttribute('aria-pressed', String(preferences.points));
soundToggle.setAttribute('aria-pressed', String(preferences.sound));
watchConnectivity((value) => { online = value; });

function loadPreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { points: stored.points !== false, sound: stored.sound !== false };
  } catch {
    return { points: true, sound: true };
  }
}

function savePreferences() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Preferences are optional; the camera should keep working without storage.
  }
}

function setLoading(progress, label) {
  loadingRail.hidden = false;
  loadingLabel.textContent = label;
  loadingFill.style.width = `${Math.max(5, Math.min(100, progress * 100))}%`;
}

function showFatal(title, copy) {
  starting = false;
  running = false;
  startup.hidden = true;
  loadingRail.hidden = true;
  liveStatus.hidden = true;
  instruction.hidden = true;
  errorTitle.textContent = title;
  errorCopy.textContent = copy;
  permissionError.hidden = false;
}

function friendlyCameraError(error) {
  if (!navigator.mediaDevices?.getUserMedia) {
    return ['Камера не поддерживается', 'Этот браузер не даёт веб-приложениям доступ к камере. Открой МЯЛО в Safari.'];
  }
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return ['Доступ к камере запрещён', 'Разреши камеру для этого сайта, затем нажми «Повторить».'];
  }
  if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') {
    return ['Фронтальная камера не найдена', 'Не удалось найти доступную фронтальную камеру.'];
  }
  if (error?.name === 'NotReadableError' || error?.name === 'AbortError') {
    return ['Камера занята', 'Закрой другое приложение, использующее камеру, и попробуй снова.'];
  }
  return ['Не удалось открыть камеру', error?.message || 'Проверь разрешение камеры и повтори попытку.'];
}

async function waitForVideo() {
  if (video.readyState >= 2 && video.videoWidth) return;
  await new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Камера не отдала изображение')), 10000);
    const onReady = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    video.addEventListener('loadeddata', onReady, { once: true });
  });
}

async function openCamera() {
  setLoading(0.04, 'Запрашиваю фронтальную камеру');
  cameraStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'user' },
      width: { ideal: 720, max: 960 },
      height: { ideal: 540, max: 720 },
      frameRate: { ideal: 30, max: 30 }
    }
  });
  video.srcObject = cameraStream;
  await video.play();
  await waitForVideo();
  renderer?.rebuildLayout();
  setupProcessor(processorWidth);
}

function setupProcessor(width) {
  const sourceWidth = Math.max(1, video.videoWidth);
  const sourceHeight = Math.max(1, video.videoHeight);
  processorWidth = Math.min(width, sourceWidth);
  const height = Math.max(1, Math.round(processorWidth * sourceHeight / sourceWidth));
  processorCanvas = document.createElement('canvas');
  processorCanvas.width = processorWidth;
  processorCanvas.height = height;
  processorContext = processorCanvas.getContext('2d', {
    alpha: false,
    desynchronized: true,
    willReadFrequently: false
  });
  if (processorContext) processorContext.imageSmoothingQuality = 'low';
}

async function warmModelCache() {
  if (!('caches' in window)) return;
  const cache = await caches.open(MODEL_CACHE);
  let completed = 0;
  for (const url of MODEL_ASSETS) {
    const cached = await cache.match(url);
    if (!cached) {
      const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!response.ok) throw new Error(`Не удалось скачать модель (${response.status})`);
      await cache.put(url, response.clone());
    }
    completed += 1;
    setLoading(0.16 + completed / MODEL_ASSETS.length * 0.28, `Сохраняю зрение ${completed}/${MODEL_ASSETS.length}`);
  }
}

function createTracker() {
  tracker?.terminate();
  tracker = new Worker('./tracker-worker.js');
  tracker.addEventListener('message', handleTrackerMessage);
  tracker.addEventListener('error', (event) => {
    workerBusy = false;
    const error = new Error(event.message || 'Не удалось запустить распознавание лица и рук.');
    workshop.recordError?.(error, 'tracker');
    showFatal('Трекер упал', error.message);
  });
  tracker.postMessage({ type: 'init' });
}

function recordInferenceDuration(duration) {
  if (!Number.isFinite(duration) || duration <= 0) return;
  inferenceDurations.push(duration);
  if (inferenceDurations.length > 12) inferenceDurations.shift();
  if (inferenceDurations.length < 8 || processorWidth <= 320) return;
  const average = inferenceDurations.reduce((sum, value) => sum + value, 0) / inferenceDurations.length;
  if (average > 72) {
    setupProcessor(320);
    inferenceDurations.length = 0;
  }
}

function handleTrackerMessage(event) {
  const data = event.data;
  if (data?.type === 'progress') {
    setLoading(0.42 + data.progress * 0.56, data.label || 'Загружаю модели');
    return;
  }
  if (data?.type === 'delegate-fallback') return;
  if (data?.type === 'ready') {
    workerReady = true;
    workerBusy = false;
    loadingRail.hidden = true;
    liveStatus.hidden = false;
    instruction.hidden = false;
    statusCopy.textContent = 'Ищу лицо';
    liveStatus.dataset.state = 'search';
    running = true;
    starting = false;
    return;
  }
  if (data?.type === 'results') {
    workerBusy = false;
    recordInferenceDuration(Number(data.duration));
    latestFace = Array.isArray(data.face) ? data.face : [];
    latestHands = Array.isArray(data.hands) ? data.hands : [];
    latestHandedness = Array.isArray(data.handedness) ? data.handedness : [];
    if (latestFace.length) lastFaceAt = performance.now();
    updateTrackingState(data.timestamp || performance.now(), Boolean(data.handFresh));
    return;
  }
  if (data?.type === 'frame-error') {
    workerBusy = false;
    return;
  }
  if (data?.type === 'init-error') {
    workerBusy = false;
    const suffix = online
      ? 'Полностью закрой PWA, открой снова и повтори запуск.'
      : 'Первый запуск требует интернет, чтобы сохранить модели на устройстве.';
    const error = new Error(data.message || 'Ошибка моделей');
    workshop.recordError?.(error, 'vision');
    showFatal('Не удалось загрузить зрение', `${error.message}. ${suffix}`);
  }
}

async function start() {
  if (starting || running || !renderer) return;
  starting = true;
  workerReady = false;
  workerBusy = false;
  startButton.disabled = true;
  retryButton.disabled = true;
  permissionError.hidden = true;
  startup.hidden = true;
  setLoading(0.02, 'Поднимаю зеркало');
  await audio.unlock();

  if (!cameraStream) {
    try {
      await openCamera();
      setLoading(0.14, 'Камера готова');
    } catch (error) {
      stopCamera();
      const [title, copy] = friendlyCameraError(error);
      showFatal(title, copy);
      startButton.disabled = false;
      retryButton.disabled = false;
      return;
    }
  }

  try {
    await warmModelCache();
    createTracker();
  } catch (error) {
    workshop.recordError?.(error, 'vision-cache');
    showFatal('Не удалось загрузить зрение', `${error?.message || 'Ошибка моделей'}. Проверь интернет и повтори.`);
  } finally {
    startButton.disabled = false;
    retryButton.disabled = false;
  }
}

function stopCamera() {
  for (const track of cameraStream?.getTracks?.() || []) track.stop();
  cameraStream = null;
  video.srcObject = null;
}

function sendTrackingFrame(now) {
  if (!running || !workerReady || workerBusy || !processorContext || document.hidden) return;
  if (now - lastFrameSentAt < TRACK_INTERVAL || video.readyState < 2) return;
  if (video.currentTime === lastTrackingVideoTime) return;

  lastFrameSentAt = now;
  lastTrackingVideoTime = video.currentTime;
  processorContext.setTransform(1, 0, 0, 1, 0, 0);
  processorContext.drawImage(video, 0, 0, processorCanvas.width, processorCanvas.height);
  workerBusy = true;
  createImageBitmap(processorCanvas)
    .then((bitmap) => tracker.postMessage({ type: 'frame', bitmap, timestamp: now }, [bitmap]))
    .catch(() => { workerBusy = false; });
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function handOwner(handedness, index) {
  return `hand:${handedness || 'unknown'}:${index}`;
}

function releaseHandState(state) {
  if (!state?.node) return;
  const strength = releaseFeature(state.node);
  audio.release(strength);
  navigator.vibrate?.(strength > 0.42 ? [9, 18, 9] : 7);
  state.node = null;
}

function releaseAllHands() {
  for (const state of handStates.values()) releaseHandState(state);
  handStates.clear();
}

function updateTrackingState(timestamp, handFresh) {
  const hasFace = latestFace.length >= 468;
  updateFeatureTargets(nodes, latestFace, (point) => renderer.mapLandmarkToScreen(point));
  hadFace = hasFace;

  if (!hasFace) {
    releaseAllHands();
    liveStatus.dataset.state = 'search';
    statusCopy.textContent = 'Ищу лицо';
    instructionCopy.textContent = 'Держи лицо в центре кадра и дай зеркалу секунду';
    return;
  }

  if (!handFresh) return;

  const seenOwners = new Set();
  let activeLabel = null;
  let pinchingCount = 0;

  latestHands.forEach((hand, index) => {
    if (!Array.isArray(hand) || hand.length < 21) return;
    const owner = handOwner(latestHandedness[index], index);
    seenOwners.add(owner);
    const thumb = hand[4];
    const finger = hand[8];
    const palmA = hand[5];
    const palmB = hand[17];
    if (!thumb || !finger || !palmA || !palmB) return;

    const pinchDistance = distance(thumb, finger);
    const palmWidth = Math.max(0.035, distance(palmA, palmB));
    const ratio = pinchDistance / palmWidth;
    const targetMidpoint = renderer.mapLandmarkToScreen({
      x: (thumb.x + finger.x) * 0.5,
      y: (thumb.y + finger.y) * 0.5
    });
    const state = handStates.get(owner) || {
      pinching: false,
      node: null,
      midpoint: { ...targetMidpoint },
      targetMidpoint: { ...targetMidpoint }
    };
    const isPinching = state.pinching ? ratio < 0.49 : ratio < 0.34;
    state.targetMidpoint = targetMidpoint;

    if (isPinching) {
      pinchingCount += 1;
      if (!state.pinching) {
        state.pinching = true;
        state.midpoint = { ...targetMidpoint };
        state.node = nearestFeature(nodes, targetMidpoint, 0.102);
        if (state.node) {
          grabFeature(state.node, owner, targetMidpoint, timestamp);
          audio.grab(state.node.id);
          navigator.vibrate?.(12);
        }
      }
      if (state.node) activeLabel = state.node.label;
    } else if (state.pinching) {
      state.pinching = false;
      releaseHandState(state);
    }

    handStates.set(owner, state);
  });

  for (const [owner, state] of handStates) {
    if (seenOwners.has(owner)) continue;
    releaseHandState(state);
    handStates.delete(owner);
  }

  if (activeLabel) {
    liveStatus.dataset.state = 'grab';
    statusCopy.textContent = `Тянешь: ${activeLabel}`;
    instructionCopy.textContent = 'Теперь двигается сама деталь, а не половина лица';
  } else if (!latestHands.length) {
    liveStatus.dataset.state = 'ready';
    statusCopy.textContent = 'Лицо найдено';
    instructionCopy.textContent = 'Покажи руку и сведи большой палец с указательным';
  } else if (pinchingCount) {
    liveStatus.dataset.state = 'ready';
    statusCopy.textContent = 'Щепотка';
    instructionCopy.textContent = 'Наведи сведённые пальцы прямо на светящуюся точку';
  } else {
    liveStatus.dataset.state = 'ready';
    statusCopy.textContent = 'Рука найдена';
    instructionCopy.textContent = 'Сожми большой и указательный пальцы на точке';
  }
}

function stepHandGrabs(dt, now) {
  const blend = 1 - Math.exp(-Math.min(0.05, dt) * 27);
  for (const state of handStates.values()) {
    if (!state.pinching || !state.node) continue;
    state.midpoint.x += (state.targetMidpoint.x - state.midpoint.x) * blend;
    state.midpoint.y += (state.targetMidpoint.y - state.midpoint.y) * blend;
    moveGrabbedFeature(state.node, state.midpoint, now);
  }
}

function canvasPoint(event) {
  const rect = mirror.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / Math.max(1, rect.width),
    y: (event.clientY - rect.top) / Math.max(1, rect.height)
  };
}

function onPointerDown(event) {
  if (!running || event.button > 0 || event.target.closest('button, a')) return;
  const point = canvasPoint(event);
  const node = nearestFeature(nodes, point, 0.098);
  if (!node) return;
  event.preventDefault();
  const owner = `pointer:${event.pointerId}`;
  directGrab = { pointerId: event.pointerId, owner, node };
  capturePointer(mirror, event.pointerId);
  grabFeature(node, owner, point, event.timeStamp || performance.now());
  audio.unlock().then(() => audio.grab(node.id));
  liveStatus.dataset.state = 'grab';
  statusCopy.textContent = `Тянешь: ${node.label}`;
  instructionCopy.textContent = 'Внутри контура деталь движется цельным кусочком';
}

function onPointerMove(event) {
  if (!directGrab || directGrab.pointerId !== event.pointerId) return;
  event.preventDefault();
  moveGrabbedFeature(directGrab.node, canvasPoint(event), event.timeStamp || performance.now());
}

function finishPointer(event) {
  if (!directGrab || directGrab.pointerId !== event.pointerId) return;
  const grab = directGrab;
  directGrab = null;
  const strength = releaseFeature(grab.node);
  audio.release(strength);
  releasePointer(mirror, event.pointerId);
  liveStatus.dataset.state = hadFace ? 'ready' : 'search';
  statusCopy.textContent = hadFace ? 'Лицо найдено' : 'Ищу лицо';
}

function resizeOverlay() {
  const rect = overlay.getBoundingClientRect();
  const dpr = Math.min(1.35, window.devicePixelRatio || 1);
  const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
  const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
  if (overlay.width !== pixelWidth || overlay.height !== pixelHeight) {
    overlay.width = pixelWidth;
    overlay.height = pixelHeight;
  }
  return { width: rect.width, height: rect.height, dpr };
}

function drawFeatureZone(context, node, width, height) {
  const aspect = Math.max(0.45, width / Math.max(1, height));
  const radiusX = (node.radiusX || 0.08) / aspect * width;
  const radiusY = (node.radiusY || 0.08) * height;
  context.save();
  context.setLineDash([5, 6]);
  context.beginPath();
  context.ellipse(node.base.x * width, node.base.y * height, radiusX, radiusY, 0, 0, Math.PI * 2);
  context.strokeStyle = 'rgba(184,255,104,.58)';
  context.lineWidth = 1.2;
  context.stroke();
  context.restore();
}

function drawOverlay() {
  const context = overlay.getContext('2d');
  const { width, height, dpr } = resizeOverlay();
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  if (!running || !preferences.points) return;

  const staleFace = performance.now() - lastFaceAt > FACE_FADE_MS;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  if (!staleFace) {
    for (const node of nodes) {
      if (!node.visible || node.confidence < 0.08) continue;
      const x = (node.base.x + node.offset.x) * width;
      const y = (node.base.y + node.offset.y) * height;
      const baseX = node.base.x * width;
      const baseY = node.base.y * height;
      const grabbed = node.grabbedBy !== null;
      const displaced = Math.hypot(node.offset.x, node.offset.y) > 0.0025;

      if (grabbed) drawFeatureZone(context, node, width, height);
      if (displaced) {
        context.beginPath();
        context.moveTo(baseX, baseY);
        context.lineTo(x, y);
        context.strokeStyle = grabbed ? 'rgba(184,255,104,.92)' : 'rgba(242,238,227,.30)';
        context.lineWidth = grabbed ? 2 : 1;
        context.stroke();
        context.beginPath();
        context.arc(baseX, baseY, 2.2, 0, Math.PI * 2);
        context.fillStyle = 'rgba(242,238,227,.38)';
        context.fill();
      }

      context.beginPath();
      context.arc(x, y, grabbed ? 8.5 : 3.8, 0, Math.PI * 2);
      context.fillStyle = grabbed ? '#b8ff68' : 'rgba(242,238,227,.84)';
      context.fill();
      context.strokeStyle = grabbed ? 'rgba(23,24,22,.9)' : 'rgba(23,24,22,.55)';
      context.lineWidth = grabbed ? 2 : 1;
      context.stroke();

      if (grabbed) {
        context.font = '800 11px ui-monospace, monospace';
        context.textAlign = 'center';
        context.textBaseline = 'bottom';
        context.fillStyle = '#b8ff68';
        context.fillText(node.label.toUpperCase(), x, y - 14);
      }
    }
  }

  latestHands.forEach((hand, handIndex) => {
    if (!Array.isArray(hand) || hand.length < 21) return;
    const points = hand.map((point) => renderer.mapLandmarkToScreen(point));
    context.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      const pa = points[a];
      const pb = points[b];
      context.moveTo(pa.x * width, pa.y * height);
      context.lineTo(pb.x * width, pb.y * height);
    }
    context.strokeStyle = 'rgba(184,255,104,.46)';
    context.lineWidth = 1.25;
    context.stroke();

    const thumb = points[4];
    const finger = points[8];
    const owner = handOwner(latestHandedness[handIndex], handIndex);
    const state = handStates.get(owner);
    const midpoint = state?.midpoint || {
      x: (thumb.x + finger.x) * 0.5,
      y: (thumb.y + finger.y) * 0.5
    };
    context.beginPath();
    context.arc(midpoint.x * width, midpoint.y * height, state?.pinching ? 11 : 7, 0, Math.PI * 2);
    context.strokeStyle = state?.pinching ? '#b8ff68' : 'rgba(184,255,104,.62)';
    context.lineWidth = state?.pinching ? 2.2 : 1.2;
    context.stroke();
  });
}

function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - lastRenderAt) / 1000));
  lastRenderAt = now;
  stepHandGrabs(dt, now);
  stepFeaturePhysics(nodes, dt, reduceMotion);
  renderer?.render(nodes, Boolean(cameraStream));
  if (now - lastOverlayAt >= 1000 / 30) {
    lastOverlayAt = now;
    drawOverlay();
  }
  sendTrackingFrame(now);
  animationFrame = requestAnimationFrame(frame);
}

startButton.addEventListener('click', start);
retryButton.addEventListener('click', start);
pointsToggle.addEventListener('click', () => {
  preferences.points = !preferences.points;
  pointsToggle.setAttribute('aria-pressed', String(preferences.points));
  savePreferences();
  if (!preferences.points) overlay.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
});
soundToggle.addEventListener('click', async () => {
  preferences.sound = !preferences.sound;
  soundToggle.setAttribute('aria-pressed', String(preferences.sound));
  audio.setEnabled(preferences.sound);
  savePreferences();
  if (preferences.sound) await audio.unlock();
});
mirror.addEventListener('pointerdown', onPointerDown);
mirror.addEventListener('pointermove', onPointerMove);
mirror.addEventListener('pointerup', finishPointer);
mirror.addEventListener('pointercancel', finishPointer);
mirror.addEventListener('lostpointercapture', finishPointer);
window.addEventListener('resize', () => renderer?.rebuildLayout());
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    lastRenderAt = performance.now();
    renderer?.rebuildLayout();
  }
});
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (event) => {
  reduceMotion = event.matches;
});
window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  cancelAnimationFrame(animationFrame);
  tracker?.postMessage({ type: 'dispose' });
  tracker?.terminate();
  stopCamera();
  renderer?.destroy();
  workshop.destroy?.();
});

animationFrame = requestAnimationFrame(frame);
