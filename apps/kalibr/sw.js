const CACHE_NAME = 'kalibr-v2.0.1';
const CACHE_PREFIX = 'kalibr-';
const APP_VERSION = "2.0.1";
const RELEASE_DATE = "2026-10-19";
const RELEASE_NOTES = ["Зафиксированы известная ошибка запуска и материалы для восстановления; игровой runtime пока не исправлен."];
const APP_SHELL = [
  './', './index.html', './styles.css', './styles-core.css', './styles-menu.css', './styles-panels.css',
  './app.js', './game-part-1.js', './game-pack-0.txt', './game-pack-1.txt', './game-pack-2.txt', './game-pack-3.txt',
  './manifest.webmanifest', './icons/icon.svg',
  '../../shared/mobile-runtime.css', '../../shared/update-manager.css', '../../shared/workshop-mode.css',
  '../../shared/update-manager.js', '../../shared/mobile-runtime.js', '../../shared/workshop-mode.js'
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:2,cacheName:CACHE_NAME});
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (!response || response.status !== 200 || response.type === 'opaque') return response;
    const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)); return response;
  }).catch(() => caches.match('./index.html'))));
});
