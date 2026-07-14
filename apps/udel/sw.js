const CACHE_PREFIX = 'udel-';
const CACHE_NAME = 'udel-v1.5.0';
const APP_VERSION = '1.5.0';
const RELEASE_DATE = '2026-07-14';
const RELEASE_NOTES = [
  'Карта расширена до двадцати связанных областей с цельной береговой линией, реками, дорогами и естественными внутренними границами.',
  'Провинции получили население, автономию, культуру, веру, ресурс, инфраструктуру и отдельную экономическую специализацию.',
  'Экономика теперь учитывает налоги, продовольствие, людские резервы, содержание армии, крепостей и двора.',
  'Сословия получили влияние, требования и привилегии, а законы теперь меняют реальные правила государства.',
  'Кампания увеличена до семидесяти двух сезонов, добавлены миграция старых сохранений и расширенные объяснения последствий.'
];
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './game-loader.js',
  './chunks/game-01.txt',
  './chunks/game-02.txt',
  './chunks/game-03.txt',
  './chunks/game-04.txt',
  './chunks/game-05.txt',
  './chunks/game-06.txt',
  './chunks/game-07.txt',
  './styles/part-01.css',
  './styles/part-02.css',
  './styles/part-03.css',
  './styles/part-04.css',
  './app.config.json',
  './manifest.webmanifest',
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
