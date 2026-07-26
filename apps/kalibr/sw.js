const CACHE_NAME = 'kalibr-v1.0.0';
const CACHE_PREFIX = 'kalibr-';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './styles-core.css',
  './styles-menu.css',
  './styles-panels.css',
  './app.js',
  './game-part-1.js',
  './game-part-2.js',
  './game-part-3.js',
  './game-part-4.js',
  './game-part-5.js',
  './game-part-6.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  '../../shared/mobile-runtime.css',
  '../../shared/update-manager.css',
  '../../shared/workshop-mode.css',
  '../../shared/update-manager.js',
  '../../shared/mobile-runtime.js',
  '../../shared/workshop-mode.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
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
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (!response || response.status !== 200 || response.type === 'opaque') return response;
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match('./index.html')))
  );
});
