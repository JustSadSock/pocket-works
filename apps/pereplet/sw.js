const CACHE_PREFIX = 'pereplet-';
const CACHE_NAME = 'pereplet-v1.0.0';
const APP_VERSION = '1.0.0';
const RELEASE_DATE = '2026-07-17';
const RELEASE_NOTES = [
  'Первая версия турнирной игры 6×6 с окружением, суперко и правилом перехвата.',
  'Локальная дуэль, бот с разными стилями, сохранение партии и просмотр ходов.',
  'Отчёт о 540 автоматических партиях по 30 вариантам правил.'
];
const APP_SHELL = [
  './', './index.html', './app.config.json', './styles.css', './engine.js', './ai.js', './app.js',
  './manifest.webmanifest', './icons/icon.svg', './lab/results.json',
  '../../shared/mobile-runtime.css', '../../shared/update-manager.css', '../../shared/update-manager.js'
];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))));
self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') event.ports?.[0]?.postMessage({ version: APP_VERSION, releaseDate: RELEASE_DATE, releaseNotes: RELEASE_NOTES });
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then((response) => { const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put('./', copy)); return response; }).catch(() => caches.match('./')));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (!response || response.status !== 200 || response.type === 'opaque') return response;
    const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)); return response;
  })));
});
