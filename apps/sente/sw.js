const CACHE_PREFIX = 'sente-';
const CACHE_NAME = 'sente-v2.2.0-p3';
const APP_VERSION = '2.2.0';
const RELEASE_DATE = '2026-07-13';
const CACHE_PROTOCOL = 3;
const RELEASE_NOTES = [
  'GNU Go теперь запускается в классическом Worker, совместимом с iOS WebKit.',
  'Каждое чтение получает отдельный WASM-процесс и освобождает память сразу после результата.',
  'Сбой одного чтения больше не отменяет весь ход; успешные результаты продолжают участвовать в выборе.',
  'Диагностика показывает точный этап ошибки вместо общего сообщения.'
];
const APP_SHELL = [
  './',
  './index.html',
  './app.config.json',
  './styles.css?v=2.2.0',
  './board.css?v=2.2.0',
  './sheets.css?v=2.2.0',
  './app.js?v=2.2.0',
  './runtime-1.txt?v=2.2.0',
  './runtime-2.txt?v=2.2.0',
  './runtime-3.txt?v=2.2.0',
  './runtime-4.txt?v=2.2.0',
  './go-engine.js?v=2.2.0',
  './ai-v2.2.js?v=2.2.0',
  './gnugo-client-v2.2.js?v=2.2.0',
  './gnugo-worker-v2.2.js?v=2.2.0',
  './gnugo-protocol.js?v=2.2.0',
  './dead-groups.js?v=2.2.0',
  './assets/gnugo/gnugo.js?v=2.2.0',
  './assets/gnugo/gnugo.wasm?v=2.2.0',
  './assets/gnugo/COPYING.txt?v=2.2.0',
  './assets/gnugo/SOURCE.txt?v=2.2.0',
  './manifest.webmanifest?v=2.2.0',
  './icons/icon.svg?v=2.2.0',
  '../../shared/mobile-runtime.css?v=2.2.0',
  '../../shared/mobile-runtime.js',
  '../../shared/pwa-utils.js',
  '../../shared/update-manager.css?v=2.2.0',
  '../../shared/update-manager.js?v=2.2.0',
  '../../shared/workshop-mode.css?v=2.2.0',
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

  if (!response || !response.ok) {
    throw new Error(`Fresh SENTE request failed: ${response?.status || 'network'}`);
  }

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

async function networkFirstFresh(input, canonicalUrl, fallbackUrl = canonicalUrl) {
  try {
    const response = await fetchFresh(input);
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
