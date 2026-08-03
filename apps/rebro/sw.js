const CACHE_PREFIX = 'rebro-';
const CACHE_NAME = 'rebro-v1.0.0';
const APP_VERSION = '1.0.0';
const RELEASE_DATE = '2026-08-03';
const RELEASE_NOTES = [
  'Добавлена механика вертикальных портальных ворот на рёбрах изометрического поля.',
  'Добавлены 12 камер, две пары ворот, кристаллы, препятствия и ложные монтажные рёбра.',
  'Добавлены сенсорная расстановка, разворот ворот, анимация импульса, подсказки и оценка решения.',
  'Добавлены локальный прогресс, процедурный звук, вибрация и автономная PWA.'
];

const APP_SHELL = [
  './',
  './index.html',
  './app.config.json',
  './styles.css',
  './app.js',
  './game-core.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  '../../shared/mobile-runtime.css',
  '../../shared/update-manager.css',
  '../../shared/update-manager.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') {
    event.ports?.[0]?.postMessage({
      version: APP_VERSION,
      releaseDate: RELEASE_DATE,
      releaseNotes: RELEASE_NOTES
    });
  }
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

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
