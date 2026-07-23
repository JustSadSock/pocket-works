const CACHE = 'iznanka-v1.0.0';
const PREFIX = 'iznanka-';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './app-loader.js',
  './app-core.js',
  './app-modals.js',
  './app-input.js',
  './app-combat.js',
  './app-interactions.js',
  './app-ai.js',
  './app-effects.js',
  './app-render-world.js',
  './app-render-actors.js',
  './app-boot.js',
  './engine.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  '../../shared/mobile-runtime.css',
  '../../shared/mobile-runtime.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok && (url.pathname.includes('/apps/iznanka/') || url.pathname.includes('/shared/mobile-runtime'))) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached || caches.match('./index.html'));
      return cached || network;
    })
  );
});
