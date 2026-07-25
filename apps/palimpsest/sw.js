const CACHE_PREFIX = 'palimpsest-';
const CACHE_NAME = 'palimpsest-v1.0.0';
const APP_VERSION = '1.0.0';
const RELEASE_NOTES = [
  'Процедурные державы самостоятельно воюют, торгуют, заключают союзы, распадаются и исчезают.',
  'Раз в десятилетие можно усилить державу, поднять смуту, открыть торговый путь или выдать притязание.',
  'Лента истории позволяет вернуться в прошлое, стереть будущее и продолжить с новой веткой.',
  'Карта поддерживает касание, панорамирование, масштабирование двумя пальцами и автономную офлайн-работу.'
];
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './core.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  '../../shared/mobile-runtime.css',
  '../../shared/mobile-runtime.js',
  '../../shared/update-manager.css',
  '../../shared/update-manager.js',
  '../../shared/workshop-mode.css',
  '../../shared/workshop-mode.js',
  '../../shared/pwa-utils.js',
  '../../shared/capabilities/storage.js'
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
