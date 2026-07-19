const CACHE_PREFIX = 'rat-';
const CACHE_NAME = 'rat-v1.6.1';
const APP_VERSION = '1.6.1';
const RELEASE_NOTES = [
  'Исправлен аварийный запуск после обновления экрана построения.',
  'Новый экран построения теперь является необязательным улучшением: при ошибке игра откатывается на предыдущий рабочий интерфейс.',
  'Скрипты и стили загружаются по network-first стратегии, чтобы старый app.js не смешивался с новыми файлами.',
  'Добавлена безопасная очистка кэша без удаления сохранённой расстановки.'
];
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './battle-ui-v3.css',
  './shell-ui-v4.css',
  './screen-redesign-v5.css',
  './setup-redesign-v6.css',
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
  './setup-redesign-v6.js',
  './setup-redesign-v6-recovery.js',
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
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
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

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type !== 'opaque') cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.status === 200 && response.type !== 'opaque') {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const destination = event.request.destination;
  const isAppCode = destination === 'script' || destination === 'style' || destination === 'document' || event.request.mode === 'navigate';
  event.respondWith(
    (isAppCode ? networkFirst(event.request) : cacheFirst(event.request))
      .catch(() => caches.match('./index.html'))
  );
});
