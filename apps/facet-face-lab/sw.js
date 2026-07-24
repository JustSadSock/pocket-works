const CACHE_PREFIX = 'facet-face-lab-';
const CACHE_NAME = 'facet-face-lab-v1.5.0';
const APP_VERSION = '1.5.0';
const CORE = [
  './',
  './index.html',
  './styles.css',
  './v15.css',
  './app.js',
  './facet-v15-bundle-0.txt',
  './facet-v15-bundle-1.txt',
  './facet-v15-bundle-2.txt',
  './facet-v15-bundle-3.txt',
  './manifest.webmanifest',
  './icons/icon.svg',
  '../../shared/mobile-runtime.css',
  '../../shared/mobile-runtime.js',
  '../../shared/update-manager.css',
  '../../shared/update-manager.js',
  '../../shared/workshop-mode.css',
  '../../shared/workshop-mode.js',
  '../../shared/capabilities/storage.js',
  '../../shared/pwa-utils.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
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
  const sameOrigin = url.origin === self.location.origin;
  const appAsset = sameOrigin && (url.pathname.includes('/apps/facet-face-lab/') || url.pathname.includes('/shared/'));
  if (!appAsset) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') event.source?.postMessage({ type: 'APP_VERSION', version: APP_VERSION });
});
