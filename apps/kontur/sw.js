const CACHE_PREFIX = 'kontur-';
const CACHE_NAME = 'kontur-v1.0.0';
const APP_VERSION = '1.0.0';
const RELEASE_DATE = '2026-07-13';
const RELEASE_NOTES = [
  'Добавлена бесконечная последовательность гарантированно проходимых процедурных плат.',
  'Добавлена игра в реальном времени: импульс движется сам, а модули вращаются касанием.',
  'Добавлены предохранители, нарастающая скорость, выбор аппаратных модулей и локальное продолжение забега.',
  'Добавлены синтезированные звуки, офлайн-режим, Workshop и полноценная интеграция в Pocket Works.'
];
const APP_SHELL = [
  './',
  './index.html',
  './app.config.json',
  './styles.css',
  './app.js',
  './runtime/part-00.txt',
  './runtime/part-01.txt',
  './runtime/part-02.txt',
  './runtime/part-03.txt',
  './runtime/part-04.txt',
  './runtime/part-05.txt',
  './manifest.webmanifest',
  './README.md',
  './icons/icon.svg',
  '../../shared/mobile-runtime.css',
  '../../shared/mobile-runtime.js',
  '../../shared/update-manager.css',
  '../../shared/update-manager.js',
  '../../shared/workshop-mode.css',
  '../../shared/workshop-mode.js',
  '../../shared/capabilities/motion.js',
  '../../shared/capabilities/storage.js',
  '../../shared/capabilities/transfer.js',
  '../../shared/capabilities/audio.js',
  '../../shared/capabilities/device.js',
  '../../shared/capabilities/diagnostics.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') {
    event.ports?.[0]?.postMessage({ version: APP_VERSION, releaseDate: RELEASE_DATE, releaseNotes: RELEASE_NOTES });
  }
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
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
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./', copy));
          return response;
        })
        .catch(() => caches.match('./'))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (!response || response.status !== 200 || response.type === 'opaque') return response;
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }))
  );
});
