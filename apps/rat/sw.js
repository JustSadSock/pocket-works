const CACHE_PREFIX = 'rat-';
const CACHE_NAME = 'rat-v1.5.0';
const APP_VERSION = '1.5.0';
const RELEASE_NOTES = [
  'Главный экран стал чище: поле боя снова доминирует, а армия и действия собраны в единый командный блок.',
  'Штабной стол больше не дублирует полки: схема, выбор строя и позиции помещаются на одном мобильном экране.',
  'Экран результата использует последний кадр реального сражения и получил закреплённую панель следующих действий.',
  'Композиции адаптированы под короткие и узкие экраны без потери полезной площади.'
];
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './battle-ui-v3.css',
  './shell-ui-v4.css',
  './screen-redesign-v5.css',
  './app.js',
  './game-part-1.js',
  './game-part-2.js',
  './game-part-3.js',
  './game-part-4.js',
  './game-part-5.js',
  './game-part-6.js',
  './game-part-7.js',
  './combat-v2-1.js',
  './combat-v2-2.js',
  './combat-v2-3.js',
  './combat-v2-4.js',
  './combat-v2-5.js',
  './combat-v2-6.js',
  './combat-v2-run.js',
  './command-system-v2.js',
  './command-system-v2-fix.js',
  './battle-ui-v3.js',
  './battle-ui-v3-fix.js',
  './game-part-8.js',
  './shell-ui-v4.js',
  './shell-ui-v4-fix.js',
  './screen-redesign-v5.js',
  './screen-redesign-v5-fix.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  '../../shared/mobile-runtime.css',
  '../../shared/mobile-runtime.js',
  '../../shared/update-manager.css',
  '../../shared/update-manager.js',
  '../../shared/workshop-mode.css',
  '../../shared/workshop-mode.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data?.type === 'GET_UPDATE_INFO') {
    event.ports?.[0]?.postMessage({ version: APP_VERSION, releaseNotes: RELEASE_NOTES });
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (!response || response.status !== 200 || response.type === 'opaque') return response;
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match('./index.html')))
  );
});