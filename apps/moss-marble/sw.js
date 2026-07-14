const CACHE_PREFIX = 'moss-marble-';
const CACHE_NAME = 'moss-marble-v1.4.1';
const APP_VERSION = '1.4.1';
const RELEASE_DATE = '2026-07-14';
const RELEASE_NOTES = [
  'Исправлено зависание мяча внутри лунки: любое подтверждённое падение теперь завершается либо попаданием, либо настоящим lip-out.',
  'Коллизии учитывают нижнюю и верхнюю высоту объектов; мяч больше не проходит под поднятым препятствием и может перелетать только достаточно низкие объекты.',
  'Траектории роторов проверяются целиком и автоматически укорачиваются или удаляются при пересечении с камнями, стенами, лункой и другими механизмами.',
  'Объекты, случайно попавшие на воду, мост или склон, переносятся на устойчивую поверхность до построения сцены.'
];
const APP_SHELL = [
  './',
  './index.html',
  './app.config.json',
  './styles.css?v=1.3.0',
  './styles14.css?v=1.4.1',
  './levels.js',
  './procedural.js',
  './terrain.js',
  './integrity.js',
  './physics.js',
  './render.js',
  './experience14.js',
  './camera-intro-guard.js?v=1.4.1',
  './audio.js',
  './app.js?v=1.4.1',
  './manifest.webmanifest',
  './icons/icon.svg',
  '../../shared/mobile-runtime.css',
  '../../shared/mobile-runtime.js',
  '../../shared/pwa-utils.js',
  '../../shared/update-manager.css',
  '../../shared/update-manager.js',
  '../../shared/workshop-mode.css',
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

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./', copy));
          return response;
        })
        .catch(() => caches.match('./'))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (!response || response.status !== 200 || response.type === 'opaque') return response;
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }))
  );
});
