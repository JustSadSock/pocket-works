const CACHE_PREFIX = 'moss-marble-';
const CACHE_NAME = 'moss-marble-v1.23.0';
const APP_VERSION = '1.23.0';
const RELEASE_DATE = '2026-10-23';
const RELEASE_NOTES = [
  "Финальная проверка девяти лунок: обзорная камера учитывает высоту флажков и садовых миниатюр, не прячет их под HUD.",
  "При сопровождении камера удерживает мраморный мяч между счётом и нижними кнопками, включая крайние участки маршрута.",
  "Декоративные Canvas-слои перерисовываются реже при неизменном кадре; физика, WebGL, прицеливание и управление не ограничены по частоте.",
  "Контурные подсказки вокруг мяча и лунки стали сдержаннее: они появляются только там, где действительно помогают их увидеть.",
  "Системное уменьшение анимаций отключает декоративный дождь, но сохраняет чёткость картинки; добавлены проверки девяти лунок и семи типов экранов."
];
const APP_SHELL = [
  './',
  './index.html',
  './app.config.json',
  './styles.css?v=1.23.0',
  './styles14.css?v=1.4.0',
  './styles15.css?v=1.5.0',
  './styles16.css?v=1.6.0',
  './styles161.css?v=1.14.0',
  './styles115.css?v=1.23.0',
  './styles121.css?v=1.23.0',
  './levels.js',
  './procedural.js',
  './camera-space.js',
  './field-guide.js',
  './garden-identity.js',
  './scenic-frame-gate.js',
  './curb-profile.js',
  './light-space.js',
  './playability.js',
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
  './camera-intro-guard.js?v=1.23.0',
  './audio.js',
  './app.js?v=1.23.0',
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
