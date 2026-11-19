const PREFIX = 'skol-siege-';
const CACHE = 'skol-siege-v1.0.0';
const APP_VERSION = '1.0.0';
const RELEASE_DATE = '2026-11-19';
const RELEASE_NOTES = [
  'Три тактические осады с разрушаемой каменной крепостью и разными ветрами.',
  'Три боеприпаса, жестовое наведение, физический полёт, каменные осколки и звуковой отклик.',
  'Сохранение прохождения, рекорды, управление с клавиатуры и автономная работа.'
];
const FILES = [
  './', './index.html', './styles.css', './app.js', './model.mjs', './app.config.json',
  './manifest.webmanifest', './icons/icon.svg',
  '../../shared/mobile-runtime.css', '../../shared/mobile-runtime.js',
  '../../shared/update-manager.css', '../../shared/update-manager.js',
  '../../shared/workshop-mode.css', '../../shared/workshop-mode.js',
  '../../shared/capabilities/motion.js', '../../shared/capabilities/storage.js',
  '../../shared/capabilities/transfer.js', '../../shared/capabilities/audio.js',
  '../../shared/capabilities/device.js', '../../shared/capabilities/diagnostics.js'
];
const scope = new URL('./', self.registration.scope);
const KNOWN = new Set(FILES.map(path => new URL(path, scope).pathname));
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_UPDATE_INFO') event.ports?.[0]?.postMessage({
    version: APP_VERSION, releaseDate: RELEASE_DATE,
    releaseNotes: RELEASE_NOTES, cacheName: CACHE, cacheProtocol: 2
  });
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate' && url.pathname.startsWith(scope.pathname)) {
    event.respondWith(fetch(event.request).catch(() => caches.match('./'))); return;
  }
  if (!KNOWN.has(url.pathname)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && response.type !== 'opaque') {
      const cloned = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, cloned)));
    }
    return response;
  }).catch(() => caches.match(event.request)));
});
