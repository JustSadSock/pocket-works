const CACHE_PREFIX = 'polus-';
const CACHE_NAME = 'polus-v1.0.0';
const APP_VERSION = '1.0.0';
const RELEASE_DATE = '2026-09-29';
const CACHE_PROTOCOL = 2;
const RELEASE_NOTES = [
  'Первый релиз: адаптивный тест на 10–100 вопросов и десять независимых политических осей.',
  'Добавлены классическая двухосевая проекция, оценка уверенности, сохранение прогресса и повторный проход.',
  'Добавлен нейтральный справочник современных государств и исторических политических фигур без автоматического рейтинга или рекомендаций.'
];
const APP_SHELL = [
  './',
  './index.html',
  './app.config.json',
  './styles.css',
  './data.js',
  './app.js',
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
const BUILD_TOKEN = APP_VERSION + '-p' + CACHE_PROTOCOL;
const SHELL_KEYS = new Map(
  APP_SHELL.map(function (entry) {
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
  if (!response || !response.ok) {
    throw new Error('Fresh application request failed: ' + (response && response.status ? response.status : 'network'));
  }
  return response;
}

async function precacheFreshShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    Array.from(new Set(SHELL_KEYS.values())).map(async function (canonicalUrl) {
      const response = await fetchFresh(canonicalUrl);
      await cache.put(canonicalUrl, response);
    })
  );
}

async function networkFirstFresh(request, canonicalUrl, fallbackUrl) {
  try {
    const response = await fetchFresh(request);
    const cache = await caches.open(CACHE_NAME);
    await cache.put(canonicalUrl, response.clone());
    return response;
  } catch {
    return caches.match(canonicalUrl).then(function (cached) {
      return cached || caches.match(fallbackUrl || canonicalUrl);
    });
  }
}

self.addEventListener('install', function (event) {
  event.waitUntil(precacheFreshShell());
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'GET_UPDATE_INFO') {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({
        version: APP_VERSION,
        releaseDate: RELEASE_DATE,
        releaseNotes: RELEASE_NOTES,
        cacheProtocol: CACHE_PROTOCOL,
        cacheName: CACHE_NAME
      });
    }
  }
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) { return key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME; })
            .map(function (key) { return caches.delete(key); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
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
