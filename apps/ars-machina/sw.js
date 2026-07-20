const CACHE_PREFIX = 'ars-machina-';
const CACHE_NAME = 'ars-machina-v1.6.0-p5';
const APP_VERSION = '1.6.0';
const RELEASE_DATE = '2026-07-20';
const CACHE_PROTOCOL = 5;
const RELEASE_NOTES = [
  'Инспектор стал компактным и не мешает перемещать выбранную деталь; палитра показывает нарисованные миниатюры механизмов.',
  'Физика получила подшаги, ограничение импульсов, автоматическую проверку модели и восстановление нестабильных состояний.',
  'Свободные, ограниченные и жёсткие связи независимы друг от друга и от посадки вала даже в одной точке.',
  'Цепи, ремни, шестерни и рейки используют единый расчёт передачи; добавлены каретка, демпфер, серво, воздушный винт и новые чертежи.'
];
const APP_SHELL = [
  './',
  './index.html',
  './app.config.json',
  './styles.css',
  './enhancements.css',
  './joints.css',
  './v16.css',
  './app.js',
  './engine/part-1.txt',
  './engine/part-2.txt',
  './engine/part-3.txt',
  './engine/part-4.txt',
  './engine/part-5.txt',
  './engine/part-6.txt',
  './engine/part-7.txt',
  './engine/part-8.txt',
  './engine/part-9.txt',
  './engine/part-10.txt',
  './engine/part-11.txt',
  './engine/part-12.txt',
  './engine/part-13.txt',
  './engine/part-14.txt',
  './engine/part-15a.txt',
  './engine/part-15b.txt',
  './engine/part-15c.txt',
  './engine/part-16a.txt',
  './engine/part-16b.txt',
  './engine/part-17a.txt',
  './engine/part-17b.txt',
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

const SCOPE_URL = new URL('./', self.registration.scope);
const BUILD_TOKEN = `${APP_VERSION}-p${CACHE_PROTOCOL}`;
const SHELL_KEYS = new Map(APP_SHELL.map((entry) => {
  const url = new URL(entry, SCOPE_URL);
  return [url.pathname, url.href];
}));

function buildNetworkUrl(input) {
  const url = new URL(input instanceof Request ? input.url : input, SCOPE_URL);
  url.searchParams.set('__pw_build', BUILD_TOKEN);
  return url;
}

async function fetchFresh(input) {
  const response = await fetch(buildNetworkUrl(input), {
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'follow'
  });
  if (!response || !response.ok) throw new Error(`Fresh application request failed: ${response?.status || 'network'}`);
  return response;
}

async function precacheFreshShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all([...new Set(SHELL_KEYS.values())].map(async (canonicalUrl) => {
    const response = await fetchFresh(canonicalUrl);
    await cache.put(canonicalUrl, response);
  }));
}

async function networkFirstFresh(request, canonicalUrl, fallbackUrl = canonicalUrl) {
  try {
    const response = await fetchFresh(request);
    const cache = await caches.open(CACHE_NAME);
    await cache.put(canonicalUrl, response.clone());
    return response;
  } catch {
    return caches.match(canonicalUrl).then((cached) => cached || caches.match(fallbackUrl));
  }
}

self.addEventListener('install', (event) => event.waitUntil(precacheFreshShell()));
self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') {
    event.ports?.[0]?.postMessage({ version: APP_VERSION, releaseDate: RELEASE_DATE, releaseNotes: RELEASE_NOTES, cacheProtocol: CACHE_PROTOCOL, cacheName: CACHE_NAME });
  }
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstFresh(event.request, SCOPE_URL.href, SCOPE_URL.href));
    return;
  }
  const canonicalUrl = SHELL_KEYS.get(requestUrl.pathname);
  if (canonicalUrl) event.respondWith(networkFirstFresh(event.request, canonicalUrl, SCOPE_URL.href));
});
