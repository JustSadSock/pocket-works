const CACHE_PREFIX = 'zamazka-';
const CACHE_NAME = 'zamazka-v1.9.0';
const ART_CACHE = 'zamazka-artworks-v1.9.0';
const APP_VERSION = '1.9.0';
const RELEASE_DATE = '2026-10-12';
const CACHE_PROTOCOL = 2;
const RELEASE_NOTES = ["Плавная галерея: картины физически перемещаются между рамами без подмены во время анимации.","Общий холст в комнате ожидания: все рисуют одновременно через PocketNet с передачей небольших штрихов.","Рисунок сохраняется в комнате, восстанавливается при входе и переподключении; куратор может очистить холст."];
const APP_SHELL = [
  './',
  './index.html',
  './app.config.json',
  './styles.css',
  './gallery-theme.css',
  './atelier-shell.css',
  './gallery-motion.css',
  './desktop-layout.css',
  './restoration-17.css',
  './legacy-artworks.js',
  './app.js',
  './tab-guests.js',
  './room-code.js',
  './emblem.js',
  './museum-motion.js',
  './commons-board.js',
  './artworks.js',
  './museum-catalog.js',
  './editor.js',
  '../../shared/capabilities/net.js',
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

  if (!response || !response.ok) {
    throw new Error(`Fresh application request failed: ${response?.status || 'network'}`);
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
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME && key !== ART_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin === 'https://thumb.wikimedia.org' &&
      requestUrl.pathname.startsWith('/wikipedia/commons/thumb/')) {
    event.respondWith((async () => {
      const cache = await caches.open(ART_CACHE);
      const stored = await cache.match(event.request);
      if (stored) return stored;
      try {
        const response = await fetch(event.request);
        if (response.ok && response.type === 'cors') {
          await cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        return (await cache.match(event.request)) || Response.error();
      }
    })());
    return;
  }
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstFresh(event.request, SCOPE_URL.href, SCOPE_URL.href));
    return;
  }

  const canonicalUrl = SHELL_KEYS.get(requestUrl.pathname);
  if (!canonicalUrl) return;

  event.respondWith(networkFirstFresh(event.request, canonicalUrl, SCOPE_URL.href));
});
