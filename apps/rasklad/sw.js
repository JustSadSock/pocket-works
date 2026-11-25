const RELEASE_NOTES = ["Добавлен слайдер плотности 0–100%: он регулирует количество свободного пространства между изображениями без разрешения пересечений.","Изменение плотности сохраняет текущий seed, поэтому композиция предсказуемо сжимается и разжимается вместо случайной перестановки.","Выбранная плотность сохраняется между запусками; значение по умолчанию — 85%."];
const CACHE_PREFIX = 'rasklad-';
const CACHE_NAME = 'rasklad-v1.2.0';
const APP_VERSION = "1.2.0";
const RELEASE_DATE = "2026-10-01";
const APP_SHELL = ["../../shared/update-manager.js","../../shared/update-manager.css","../../shared/pwa-utils.js",
  './',
  './index.html',
  './app.config.json',
  './styles.css',
  './app.js',
  './layout-core.js',
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
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') {
    event.ports?.[0]?.postMessage({
      version: APP_VERSION,
      releaseDate: RELEASE_DATE,
      releaseNotes: RELEASE_NOTES,
      cacheName: CACHE_NAME
    });
  }
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('./')));
    return;
  }

  const isShell = APP_SHELL.some((entry) => new URL(entry, self.registration.scope).pathname === requestUrl.pathname);
  if (!isShell) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }))
  );
});
