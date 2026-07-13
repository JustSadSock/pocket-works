const CACHE_PREFIX = 'sente-';
const CACHE_NAME = 'sente-v2.1.0';
const APP_VERSION = '2.1.0';
const RELEASE_DATE = '2026-07-13';
const RELEASE_NOTES = [
  "Исполняемые файлы, worker и WASM получили версионные URL, поэтому старый iOS-кэш больше не может смешать интерфейс 2.x с прежним ботом.",
  "При первом запуске 2.1 незавершённая партия против старого компьютера закрывается, чтобы новый движок не продолжал уже испорченную позицию.",
  "Имя соперника теперь явно показывает GNU Go, а аварийный переход на резервную эвристику отображается как ошибка движка.",
  "Браузерный тест проверяет загрузку только версионных ресурсов и настоящий GNU Go worker в Chromium и WebKit."
];
const APP_SHELL = [
  './',
  './index.html',
  './app.config.json',
  './styles.css?v=2.1.0',
  './board.css?v=2.1.0',
  './sheets.css?v=2.1.0',
  './app.js?v=2.1.0',
  './runtime-1.txt?v=2.1.0',
  './runtime-2.txt?v=2.1.0',
  './runtime-3.txt?v=2.1.0',
  './runtime-4.txt?v=2.1.0',
  './go-engine.js?v=2.1.0',
  './ai-v2.1.js?v=2.1.0',
  './gnugo-client-v2.1.js?v=2.1.0',
  './gnugo-worker-v2.1.js?v=2.1.0',
  './gnugo-protocol.js?v=2.1.0',
  './dead-groups.js?v=2.1.0',
  './assets/gnugo/gnugo.js?v=2.1.0',
  './assets/gnugo/gnugo.wasm?v=2.1.0',
  './assets/gnugo/COPYING.txt?v=2.1.0',
  './assets/gnugo/SOURCE.txt?v=2.1.0',
  './manifest.webmanifest?v=2.1.0',
  './icons/icon.svg?v=2.1.0',
  '../../shared/mobile-runtime.css?v=2.1.0',
  '../../shared/mobile-runtime.js',
  '../../shared/pwa-utils.js',
  '../../shared/update-manager.css?v=2.1.0',
  '../../shared/update-manager.js?v=2.1.0',
  '../../shared/workshop-mode.css?v=2.1.0',
  '../../shared/workshop-mode.js',
  '../../shared/capabilities/motion.js',
  '../../shared/capabilities/storage.js',
  '../../shared/capabilities/transfer.js',
  '../../shared/capabilities/audio.js',
  '../../shared/capabilities/device.js',
  '../../shared/capabilities/diagnostics.js'
];

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

function cacheResponse(request, response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return response;
  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
  return response;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => cacheResponse('./', response))
        .catch(() => caches.match('./'))
    );
    return;
  }

  const isLegacySenteRuntime = requestUrl.pathname.includes('/apps/sente/')
    && /\.(?:js|css|txt|wasm)$/.test(requestUrl.pathname)
    && requestUrl.searchParams.get('v') !== APP_VERSION;

  if (isLegacySenteRuntime) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => cacheResponse(event.request, response))
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => cacheResponse(event.request, response)))
  );
});
