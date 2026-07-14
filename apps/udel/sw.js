const CACHE_PREFIX = 'udel-';
const CACHE_NAME = 'udel-v2.6.0';
const APP_VERSION = '2.6.0';
const RELEASE_DATE = '2026-07-14';
const RELEASE_NOTES = [
  'Провинции открываются компактной панелью над навигацией, а карта остаётся видимой.',
  'Сводка, решения и управление разделены на три короткие вкладки.',
  'Верхняя панель, карта, навигация, технологии и армия получили более спокойную и компактную иерархию.'
];
const numberedChunks = Array.from({ length: 10 }, (_, index) => `./chunks/game-${String(index + 1).padStart(2, '0')}.txt`);
const laterChunks = ['11a', '11b', '11c', '11d', '12a', '12b', '12c', '13', '14', '15a', '15b'].map((name) => `./chunks/game-${name}.txt`);
const styleParts = ['01', '02', '03', '04', '05', '06a', '06b', '06c', '07', '08a', '08b'].map((name) => `./styles/part-${name}.css`);
const APP_SHELL = [
  './', './index.html', './styles.css', './app.js', './game-loader.js',
  ...numberedChunks, ...laterChunks, ...styleParts,
  './app.config.json', './manifest.webmanifest', './icons/icon.svg',
  '../../shared/mobile-runtime.css', '../../shared/mobile-runtime.js',
  '../../shared/update-manager.css', '../../shared/update-manager.js',
  '../../shared/workshop-mode.css', '../../shared/workshop-mode.js',
  '../../shared/capabilities/motion.js', '../../shared/capabilities/storage.js', '../../shared/capabilities/transfer.js',
  '../../shared/capabilities/audio.js', '../../shared/capabilities/device.js', '../../shared/capabilities/diagnostics.js'
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
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request)
      .then((response) => {
        caches.open(CACHE_NAME).then((cache) => cache.put('./', response.clone()));
        return response;
      })
      .catch(() => caches.match('./')));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (!response || response.status !== 200 || response.type === 'opaque') return response;
    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});
