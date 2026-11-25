const RELEASE_NOTES = ["Добавлен процедурный редактор средневековых миниатюр с фигурами, предметами, существами и архитектурой.","Сцена редактируется напрямую: элементы можно выбирать, перетаскивать, масштабировать, отражать, перекрашивать и удалять с отменой действий.","Добавлены историзованные палитры, фоны, рамки, орнаменты, подписи, сюжетные пресеты и умная случайная сборка сцены.","Проект автоматически сохраняется локально, работает офлайн и экспортирует чистую иллюстрацию в PNG."];
const RELEASE_DATE = "2026-08-29";
const APP_VERSION = "1.0.0";
const CACHE_NAME = 'scriptorium-v1.0.0';
const PREFIX = 'scriptorium-';
const SHELL = ["../../shared/update-manager.js","../../shared/update-manager.css","../../shared/pwa-utils.js",
  './',
  './index.html',
  './styles.css',
  './app.js',
  './model.js',
  './controls.js',
  './painter.js',
  './subjects.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  '../../shared/mobile-runtime.css',
  '../../shared/mobile-runtime.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
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

self.addEventListener('message',event=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:1,cacheName:"scriptorium-v1.0.0"});if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
