import { FaceLandmarker, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs';

const VERSION = '0.10.35';
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

let faceLandmarker = null;
let handLandmarker = null;
let frameCounter = 0;
let lastHands = [];
let lastHandedness = [];
let initialized = false;

function postProgress(progress, label) {
  self.postMessage({ type: 'progress', progress, label });
}

async function init() {
  if (initialized) return;
  postProgress(0.08, 'Загружаю движок зрения');
  const fileset = {
    wasmLoaderPath: `${WASM_ROOT}/vision_wasm_module_internal.js`,
    wasmBinaryPath: `${WASM_ROOT}/vision_wasm_module_internal.wasm`
  };

  const createWithFallback = async (Task, options) => {
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
  };

  postProgress(0.22, 'Настраиваю карту лица');
  faceLandmarker = await createWithFallback(FaceLandmarker, {
    baseOptions: { modelAssetPath: FACE_MODEL },
    runningMode: 'VIDEO',
    numFaces: 1,
    minFaceDetectionConfidence: 0.48,
    minFacePresenceConfidence: 0.48,
    minTrackingConfidence: 0.45,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false
  });

  postProgress(0.64, 'Настраиваю пальцы');
  handLandmarker = await createWithFallback(HandLandmarker, {
    baseOptions: { modelAssetPath: HAND_MODEL },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.42,
    minHandPresenceConfidence: 0.42,
    minTrackingConfidence: 0.4
  });

  initialized = true;
  postProgress(1, 'Готово');
  self.postMessage({ type: 'ready' });
}

function normalizeHandedness(raw) {
  return raw.map((classificationList) => classificationList?.[0]?.categoryName || classificationList?.[0]?.displayName || 'Unknown');
}

async function processFrame(bitmap, timestamp) {
  if (!initialized || !faceLandmarker || !handLandmarker) {
    bitmap.close();
    self.postMessage({ type: 'frame-error', message: 'Трекер ещё не готов' });
    return;
  }

  try {
    const face = faceLandmarker.detectForVideo(bitmap, timestamp);
    frameCounter += 1;
    if (frameCounter % 2 === 0 || lastHands.length === 0) {
      const hands = handLandmarker.detectForVideo(bitmap, timestamp);
      lastHands = hands.landmarks || [];
      lastHandedness = normalizeHandedness(hands.handedness || []);
    }

    self.postMessage({
      type: 'results',
      timestamp,
      face: face.faceLandmarks?.[0] || [],
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
    initialized = false;
  }
});
