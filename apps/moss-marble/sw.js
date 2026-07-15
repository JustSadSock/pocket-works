const CACHE_PREFIX = 'moss-marble-';
const CACHE_NAME = 'moss-marble-v1.10.0';
const APP_VERSION = '1.10.0';
const RELEASE_DATE = '2026-07-15';
const RELEASE_NOTES = [
  'Кампания отделена от тренировки: незавершённый круг и текущая бесконечная секция теперь сохраняют удары и безопасную позицию мяча.',
  'Убраны разрывы асимметричных холмов; тоннели проверяют направление, минимальную скорость и вход в триггер.',
  'Вода добавляет штрафной удар, а результат корректно склоняет удары и не записывает частичный маршрут как полный круг.',
  'Бесконечные маршруты можно открывать и передавать по коду; новый путь требует подтверждения.',
  'Добавлены шкала силы, клавиатурное управление, уникальные схемы лунок, звук качения и полноценный Canvas fallback.'
];
const APP_SHELL = [
  './',
  './index.html',
  './app.config.json',
  './styles.css?v=1.3.0',
  './styles14.css?v=1.4.0',
  './styles15.css?v=1.5.0',
  './styles16.css?v=1.6.0',
  './styles161.css?v=1.10.0',
  './levels.js',
  './procedural.js',
  './course17.js',
  './course18.js',
  './course19.js',
  './terrain.js',
  './terrain17.js',
  './terrain18.js',
  './polish19.js',
  './integrity.js',
  './physics.js',
  './state.js',
  './render-core14.js',
  './greenhouse15.js',
  './render.js',
  './experience14.js',
  './camera-intro-guard.js?v=1.10.0',
  './audio.js',
  './app.js?v=1.10.0',
  './manifest.webmanifest',
  './icons/icon.svg',
  '../../shared/mobile-runtime.css',
  '../../shared/mobile-runtime.js',
  '../../shared/pwa-utils.js',
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
