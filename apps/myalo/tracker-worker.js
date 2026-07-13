const VISION_BUNDLE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs';
const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const HAND_INTERVAL_MS = 92;

let faceLandmarker = null;
let handLandmarker = null;
let lastHands = [];
let lastHandedness = [];
let lastHandsAt = -Infinity;
let initialized = false;
let visionRuntime = null;

function postProgress(progress, label) {
  self.postMessage({ type: 'progress', progress, label });
}

async function loadVisionRuntime() {
  if (!visionRuntime) visionRuntime = await import(VISION_BUNDLE);
  const { FaceLandmarker, HandLandmarker, FilesetResolver } = visionRuntime;
  if (!FaceLandmarker || !HandLandmarker || !FilesetResolver) {
    throw new Error('Движок MediaPipe загрузился не полностью');
  }
  return { FaceLandmarker, HandLandmarker, FilesetResolver };
}

async function createWithFallback(Task, fileset, options) {
  try {
    return await Task.createFromOptions(fileset, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: 'GPU' }
    });
  } catch (gpuError) {
    self.postMessage({ type: 'delegate-fallback', message: gpuError?.message || 'GPU delegate unavailable' });
    return Task.createFromOptions(fileset, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: 'CPU' }
    });
  }
}

async function init() {
  if (initialized) return;
  postProgress(0.05, 'Загружаю движок зрения');
  const { FaceLandmarker, HandLandmarker, FilesetResolver } = await loadVisionRuntime();
  const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);

  postProgress(0.24, 'Настраиваю карту лица');
  faceLandmarker = await createWithFallback(FaceLandmarker, fileset, {
    baseOptions: { modelAssetPath: FACE_MODEL },
    runningMode: 'VIDEO',
    numFaces: 1,
    minFaceDetectionConfidence: 0.46,
    minFacePresenceConfidence: 0.46,
    minTrackingConfidence: 0.42,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false
  });

  postProgress(0.66, 'Настраиваю пальцы');
  handLandmarker = await createWithFallback(HandLandmarker, fileset, {
    baseOptions: { modelAssetPath: HAND_MODEL },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.40,
    minHandPresenceConfidence: 0.40,
    minTrackingConfidence: 0.38
  });

  initialized = true;
  postProgress(1, 'Готово');
  self.postMessage({ type: 'ready' });
}

function normalizeHandedness(raw) {
  return raw.map((classificationList) => classificationList?.[0]?.categoryName || classificationList?.[0]?.displayName || 'Unknown');
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

async function processFrame(bitmap, timestamp) {
  if (!initialized || !faceLandmarker || !handLandmarker) {
    bitmap.close();
    self.postMessage({ type: 'frame-error', message: 'Трекер ещё не готов' });
    return;
  }

  const startedAt = nowMs();
  let handFresh = false;
  try {
    const faceResult = faceLandmarker.detectForVideo(bitmap, timestamp);
    const face = faceResult.faceLandmarks?.[0] || [];

    if (face.length >= 468 && timestamp - lastHandsAt >= HAND_INTERVAL_MS) {
      const handResult = handLandmarker.detectForVideo(bitmap, timestamp);
      lastHands = handResult.landmarks || [];
      lastHandedness = normalizeHandedness(handResult.handedness || []);
      lastHandsAt = timestamp;
      handFresh = true;
    } else if (face.length < 468) {
      lastHands = [];
      lastHandedness = [];
    }

    self.postMessage({
      type: 'results',
      timestamp,
      duration: nowMs() - startedAt,
      handFresh,
      face,
      hands: lastHands,
      handedness: lastHandedness
    });
  } catch (error) {
    self.postMessage({ type: 'frame-error', message: error?.message || 'Ошибка распознавания' });
  } finally {
    bitmap.close();
  }
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data?.type === 'init') {
    init().catch((error) => {
      self.postMessage({ type: 'init-error', message: error?.message || 'Не удалось загрузить модели' });
    });
  }

  if (data?.type === 'frame' && data.bitmap) {
    processFrame(data.bitmap, data.timestamp);
  }

  if (data?.type === 'dispose') {
    faceLandmarker?.close();
    handLandmarker?.close();
    faceLandmarker = null;
    handLandmarker = null;
    lastHands = [];
    lastHandedness = [];
    initialized = false;
  }
});
