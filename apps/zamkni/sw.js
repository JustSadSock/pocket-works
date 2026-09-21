const CACHE_PREFIX = 'zamkni-';
const CACHE_NAME = 'zamkni-v1.1.0';
const APP_VERSION = '1.1.0';
const RELEASE_DATE = '2026-09-22';
const CACHE_PROTOCOL = 1;
const RELEASE_NOTES = [
  'QR-pairing стал основным браузерным способом подключения: приглашение и ответ сканируются камерой.',
  'QR-сигналы сжимаются локально и не требуют интернета; длинный PWL1 оставлен как запасной способ.',
  'Исправлен надёжный запуск одиночной партии при недоступном localStorage.',
  'Первый релиз: логическая игра 5×5 на замыкание квадратов.',
  'Режимы: ИИ, 1v1, 2v2, трое и четверо каждый сам за себя.',
  'Локальный мультиплеер работает через общий PocketLAN.'
];
const VENDOR_ASSETS = [
  'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'
];
const APP_SHELL = [
  './',
  './index.html',
  './app.config.json',
  './styles.css',
  './app.js',
  './qr-codec.js',
  './game.js',
  './ai.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  '../../shared/mobile-runtime.css',
  '../../shared/mobile-runtime.js',
  '../../shared/update-manager.css',
  '../../shared/update-manager.js',
  '../../shared/workshop-mode.css',
  '../../shared/workshop-mode.js',
  '../../shared/capabilities/lan.js'
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
  const response = await fetch(buildNetworkUrl(input), { cache: 'no-store', credentials: 'same-origin', redirect: 'follow' });
  if (!response?.ok) throw new Error(`Fresh application request failed: ${response?.status || 'network'}`);
  return response;
}

async function precacheFreshShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all([...new Set(SHELL_KEYS.values())].map(async (canonicalUrl) => {
    const response = await fetchFresh(canonicalUrl);
    await cache.put(canonicalUrl, response);
  }));
  await Promise.allSettled(VENDOR_ASSETS.map(async (url) => {
    const response = await fetch(url, { cache: 'reload', mode: 'cors' });
    if (!response.ok) throw new Error(`Vendor request failed: ${response.status}`);
    await cache.put(url, response);
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
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (VENDOR_ASSETS.includes(requestUrl.href)) {
    event.respondWith(caches.match(requestUrl.href).then(async (cached) => {
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(requestUrl.href, response.clone());
        }
        return response;
      } catch {
        return new Response('', { status: 503, statusText: 'QR vendor unavailable offline' });
      }
    }));
    return;
  }
  if (requestUrl.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstFresh(event.request, SCOPE_URL.href, SCOPE_URL.href));
    return;
  }
  const canonicalUrl = SHELL_KEYS.get(requestUrl.pathname);
  if (canonicalUrl) event.respondWith(networkFirstFresh(event.request, canonicalUrl, SCOPE_URL.href));
});
