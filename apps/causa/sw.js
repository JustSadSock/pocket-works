const CACHE_PREFIX = 'causa-';
const CACHE_NAME = 'causa-v1.0.0';
const VERSION = '1.0.0';
const RELEASE = '2026-07-25';
const FILES = [
  './', './index.html', './app.config.json', './manifest.webmanifest', './icons/icon.svg', './README.md',
  '../../shared/mobile-runtime.css', '../../shared/mobile-runtime.js',
  '../../shared/update-manager.css', '../../shared/update-manager.js',
  '../../shared/workshop-mode.css', '../../shared/workshop-mode.js',
  '../../shared/capabilities/diagnostics.js', '../../shared/capabilities/transfer.js'
];
const SCOPE = new URL('./', self.registration.scope);
const canonical = new Map(FILES.map((entry) => {
  const url = new URL(entry, SCOPE);
  return [url.pathname, url.href];
}));
function fresh(input) {
  const url = new URL(input instanceof Request ? input.url : input, SCOPE);
  url.searchParams.set('__pw_build', VERSION);
  return fetch(url, { cache: 'no-store', credentials: 'same-origin' }).then((response) => {
    if (!response.ok) throw new Error(String(response.status));
    return response;
  });
}
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => Promise.all(
    [...new Set(canonical.values())].map(async (url) => cache.put(url, await fresh(url)))
  )));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') {
    event.ports?.[0]?.postMessage({
      version: VERSION,
      releaseDate: RELEASE,
      releaseNotes: ['Интерактивные причинные системы', 'Скан рычагов и петель', 'Офлайн и локальное сохранение'],
      cacheName: CACHE_NAME
    });
  }
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  const target = event.request.mode === 'navigate' ? SCOPE.href : canonical.get(url.pathname);
  if (!target) return;
  event.respondWith(
    fresh(event.request).then(async (response) => {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(target, response.clone());
      return response;
    }).catch(() => caches.match(target).then((response) => response || caches.match(SCOPE.href)))
  );
});
