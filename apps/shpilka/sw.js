const CACHE_PREFIX = 'shpilka-';
const CACHE_NAME = 'shpilka-v2.5.0-p1';
const APP_VERSION = '2.5.0';
const RELEASE_DATE = '2026-07-14';
const CACHE_PROTOCOL = 1;
const RELEASE_NOTES = [
  'Грач, Вольт, Мара и Шунт получили разные гоночные характеры: стабильность, скорость на прямых, техничность в поворотах и агрессивные атаки.',
  'Соперники теперь естественно ошибаются: поздно тормозят, широко выходят, ловят небольшой занос или неудачно прерывают обгон без резинового ускорения.',
  'Лобовые, задние и боковые контакты получили разные реакции с отдельной передачей скорости, вращением и потерей темпа без повторной дрожи кузовов.',
  'Чистая серия поворотов даёт до 2,5% дополнительной стабильности, а сектора и финиш теперь показывают время, разницу с рекордом и сравнение двух кругов.'
];
const APP_SHELL = [
  './',
  './index.html',
  './app.config.json',
  './styles.css',
  './advanced.css',
  './advanced-fixes.css',
  './systems-23.css',
  './app.js',
  './engine-v2-01.js',
  './engine-v2-02.js',
  './engine-v2-03.js',
  './engine-v2-04.js',
  './engine-v2-05.js',
  './engine-v2-06.js',
  './engine-v2-07.js',
  './engine-v2-08.js',
  './engine-v2-09.js',
  './engine-v2-10.js',
  './engine-v2-11.js',
  './engine-v2-stability.js',
  './engine-v2-advanced.js',
  './engine-v2-advanced-fixes.js',
  './engine-v2-23-ui.js',
  './engine-v2-23.js',
  './engine-v2-23-fixes.js',
  './engine-v2-24.js',
  './engine-v2-25.js',
  './engine-v2-25-fixes.js',
  './engine-v2-12.js',
  './workshop.js',
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
const SHELL_KEYS = new Map(
  APP_SHELL.map((entry) => {
    const url = new URL(entry, SCOPE_URL);
    return [url.pathname, url.href];
  })
);

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
  await Promise.all(
    [...new Set(SHELL_KEYS.values())].map(async (canonicalUrl) => {
      const response = await fetchFresh(canonicalUrl);
      await cache.put(canonicalUrl, response);
    })
  );
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

self.addEventListener('install', (event) => {
  event.waitUntil(precacheFreshShell());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') {
    event.ports?.[0]?.postMessage({
      version: APP_VERSION,
      releaseDate: RELEASE_DATE,
      releaseNotes: RELEASE_NOTES,
      cacheProtocol: CACHE_PROTOCOL,
      cacheName: CACHE_NAME
    });
  }
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
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
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstFresh(event.request, SCOPE_URL.href, SCOPE_URL.href));
    return;
  }
  const canonicalUrl = SHELL_KEYS.get(requestUrl.pathname);
  if (!canonicalUrl) return;
  event.respondWith(networkFirstFresh(event.request, canonicalUrl, SCOPE_URL.href));
});
