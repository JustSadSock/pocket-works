const CACHE_PREFIX = 'myalo-';
const CACHE_NAME = 'myalo-v1.1.0';
const APP_VERSION = '1.1.0';
const RELEASE_DATE = '2026-07-13';
const RELEASE_NOTES = [
  'Исправлен запуск распознавания лица и рук в iOS PWA; ошибка ModuleFactory not set устранена.',
  'Добавлены пошаговые всплывающие подсказки для разрешения камеры и восстановления после ошибок.',
  'Ошибки камеры и движка зрения теперь разделены и показывают релевантные действия.'
];

const APP_SHELL = [
  './', './index.html', './app.config.json', './styles.css', './support.js', './app.js', './audio.js', './feature-map.js',
  './elastic-renderer.js', './tracker-worker.js', './manifest.webmanifest', './icons/icon.svg',
  '../../shared/mobile-runtime.css', '../../shared/mobile-runtime.js', '../../shared/pwa-utils.js',
  '../../shared/update-manager.css', '../../shared/update-manager.js', '../../shared/workshop-mode.css',
  '../../shared/workshop-mode.js', '../../shared/capabilities/motion.js', '../../shared/capabilities/storage.js',
  '../../shared/capabilities/transfer.js', '../../shared/capabilities/audio.js',
  '../../shared/capabilities/device.js', '../../shared/capabilities/diagnostics.js'
];

const MODEL_ASSETS = new Set([
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs',
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/vision_wasm_internal.js',
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/vision_wasm_internal.wasm',
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/vision_wasm_nosimd_internal.js',
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/vision_wasm_nosimd_internal.wasm',
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/vision_wasm_module_internal.js',
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/vision_wasm_module_internal.wasm',
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
]);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') {
    event.ports?.[0]?.postMessage({ version: APP_VERSION, releaseDate: RELEASE_DATE, releaseNotes: RELEASE_NOTES });
  }
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response?.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (MODEL_ASSETS.has(requestUrl.href)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }
  if (requestUrl.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put('./', copy));
      return response;
    }).catch(() => caches.match('./')));
    return;
  }
  event.respondWith(cacheFirst(event.request));
});
