const CACHE_PREFIX = 'kontur-';
const CACHE_NAME = 'kontur-v1.1.1';
const APP_VERSION = '1.1.1';
const RELEASE_DATE = '2026-07-13';
const RELEASE_NOTES = [
  'Полностью собранная цепь теперь автоматически запускает форсированный прогон вместо медленного ожидания импульса.',
  'Заряд визуально проходит весь маршрут за одну–две секунды с отдельным звуком, вибрацией и световым следом.',
  'Во время проверочного прогона модули блокируются от случайного повторного поворота.',
  'Ускорение включается только для действительно правильного маршрута и отключается, если заряд находится вне него.'
];
const APP_SHELL = [
  './',
  './index.html',
  './app.config.json',
  './styles.css',
  './polish.css',
  './app.js',
  './runtime/part-00.txt',
  './runtime/part-01.txt',
  './runtime/part-02.txt',
  './runtime/part-03.txt',
  './runtime/part-04.txt',
  './runtime/part-05.txt',
  './runtime/part-06.txt',
  './runtime/part-07.txt',
  './runtime/part-08.txt',
  './manifest.webmanifest',
  './README.md',
  './icons/icon.svg',
  '../../shared/mobile-runtime.css',
  '../../shared/mobile-runtime.js',
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
