const RELEASE_NOTES = ["Первый релиз нового successor-модуля для убедительного miniature-эффекта вместо простого равномерного blur.","Добавлены режимы Авто, Сцена и Объект; лёгкий локальный анализ оценивает структуру кадра и выбирает подходящую геометрию фокуса.","Основной эффект считается одним WebGL-шейдером: сила размытия непрерывно меняется для каждого пикселя с расстоянием от резкой области, а фокус получает дополнительный contrast/saturation pop.","Фото и видео обрабатываются локально; добавлены сравнение с оригиналом, экспорт, офлайн-оболочка, touch-управление и Safari/WebKit fallback."];
const RELEASE_DATE = "2026-09-08";
const APP_VERSION = "1.0.0";
const CACHE_NAME = 'miniature-lab-v1.0.0';
const CACHE_PREFIX = "miniature-lab-";
const APP_SHELL = ["../../shared/update-manager.js","../../shared/update-manager.css","../../shared/pwa-utils.js",
  './',
  './index.html',
  './styles.css',
  './canvas-filter-polyfill.js',
  './media-utils.js',
  './analysis.js',
  './renderer.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }))
  );
});

self.addEventListener('message',event=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:1,cacheName:"miniature-lab-v1.0.0"});if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
