const CACHE_PREFIX = 'rat-';
const CACHE_NAME = 'rat-v1.2.0';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
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
  './game-part-8.js',
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
