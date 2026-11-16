const CACHE_PREFIX = 'press-';
const CACHE_NAME = 'press-v1.0.0';
const APP_VERSION = '1.0.0';
const RELEASE_DATE = '2026-11-16';
const CACHE_PROTOCOL = 2;
const RELEASE_NOTES = [
  "Сжатие изображений JPEG и WebP с настройками качества и разрешения.",
  "Локальная перекодировка видео там, где браузер поддерживает MediaRecorder и захват Canvas.",
  "Упаковка файлов и папок в ZIP и распаковка стандартных ZIP с проверкой целостности.",
  "Офлайн-PWA, сравнение исходного и конечного размера, очередь и экспорт результатов."
];
const APP_SHELL = [
  './', './index.html', './app.config.json', './styles.css', './app.js', './media.mjs', './zip.mjs', './manifest.webmanifest',
  './icons/icon.svg', '../../shared/mobile-runtime.css', '../../shared/mobile-runtime.js', '../../shared/pwa-utils.js',
  '../../shared/update-manager.css', '../../shared/update-manager.js', '../../shared/workshop-mode.css',
  '../../shared/workshop-mode.js', '../../shared/capabilities/motion.js', '../../shared/capabilities/storage.js',
  '../../shared/capabilities/transfer.js', '../../shared/capabilities/audio.js', '../../shared/capabilities/device.js',
  '../../shared/capabilities/diagnostics.js'
];
const SCOPE_URL = new URL('./', self.registration.scope);
const BUILD_TOKEN = APP_VERSION + '-p' + CACHE_PROTOCOL;
const SHELL_KEYS = new Map(APP_SHELL.map(entry => {
  const url = new URL(entry, SCOPE_URL);
  return [url.pathname, url.href];
}));
async function fetchFresh(input) {
  const url = new URL(input instanceof Request ? input.url : input, SCOPE_URL);
  url.searchParams.set('__pw_build', BUILD_TOKEN);
  const response = await fetch(url, { cache:'no-store',credentials:'same-origin',redirect:'follow' });
  if (!response?.ok) throw new Error('Could not fetch app asset: ' + (response?.status || 'network'));
  return response;
}
async function precache() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all([...new Set(SHELL_KEYS.values())].map(async url => cache.put(url, await fetchFresh(url))));
}
self.addEventListener('install', event => event.waitUntil(precache()));
self.addEventListener('message', event => {
  if (event.data?.type === 'GET_UPDATE_INFO') event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME});
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const canonical = SHELL_KEYS.get(url.pathname);
  if (event.request.mode === 'navigate') {
    event.respondWith(fetchFresh(event.request).then(async response => { const cache = await caches.open(CACHE_NAME);await cache.put(SCOPE_URL.href,response.clone());return response; }).catch(async () => await caches.match(SCOPE_URL.href) || Response.error()));
  } else if (canonical) {
    event.respondWith(fetchFresh(event.request).then(async response => { const cache=await caches.open(CACHE_NAME);await cache.put(canonical,response.clone());return response; }).catch(async () => await caches.match(canonical) || Response.error()));
  }
});
