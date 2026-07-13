const CACHE_PREFIX = 'sente-';
const CACHE_NAME = 'sente-v1.5.0';
const APP_VERSION = '1.5.0';
const RELEASE_DATE = '2026-07-13';
const RELEASE_NOTES = [
  "Статистические playout-симуляции заменены селективным minimax-поиском с alpha-beta-отсечениями и итеративным углублением.",
  "Каждый кандидат теперь проверяется против лучшего найденного ответа соперника и последующего контрответа компьютера.",
  "Нестабильные тактические позиции автоматически досчитываются дальше через отдельный поиск захватов, атари и спасений.",
  "Адаптивный характер и вариативность сохранены, но выбор возможен только между вариантами с почти одинаковым расчётным результатом."
];
const APP_SHELL = [
  './',
  './index.html',
  './app.config.json',
  './styles.css',
  './board.css',
  './sheets.css',
  './app.js',
  './runtime-1.txt',
  './runtime-2.txt',
  './runtime-3.txt',
  './runtime-4.txt',
  './go-engine.js',
  './ai.js',
  './ai-core.js',
  './ai-policy.js',
  './ai-adaptation.js',
  './ai-minimax.js',
  './dead-groups.js',
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
