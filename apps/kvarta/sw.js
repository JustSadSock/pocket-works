const RELEASE_NOTES = ["Полностью переработано ощущение вращения квартетов: фрагменты теперь идут по дуге вокруг заклёпки, приподнимаются над листом и мягко садятся на место.","Добавлены механический отклик рамы, пружинный доворот заклёпок и более выразительная анимация успешного оттиска.","Сохранён полноценный режим reduced motion и обновлён офлайн-кэш приложения."];
const RELEASE_DATE = "2026-08-22";
const APP_VERSION = "1.1.0";
const CACHE_NAME = 'kvarta-v1.1.0';
const CACHE_PREFIX = 'kvarta-';
const APP_SHELL = ["../../shared/update-manager.js","../../shared/update-manager.css","../../shared/pwa-utils.js",
  './',
  './index.html',
  './styles.css',
  './app.js',
  './motion.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  '../../shared/mobile-runtime.css',
  '../../shared/mobile-runtime.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

self.addEventListener('message',event=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:1,cacheName:"kvarta-v1.1.0"});if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
