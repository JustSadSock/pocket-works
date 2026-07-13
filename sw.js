const CACHE_PREFIX = 'pocket-works-launcher-';
const CACHE_NAME = 'pocket-works-launcher-v0.8.1';
const APP_VERSION = '0.8.1';
const RELEASE_DATE = '2026-07-13';
const CACHE_PROTOCOL = 2;
const RELEASE_NOTES = [
  'Replaced cache-first launcher execution with a network-first cache protocol that bypasses the browser HTTP cache.',
  'Every install now fetches shell files with a unique build token before writing them into the new Cache Storage namespace.',
  'The launcher Service Worker no longer intercepts or stores files owned by applications under /apps/.',
  'Removed long-lived immutable caching for mutable application assets so deployed code can actually replace older files.'
];
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './launcher-performance.css',
  './launcher-sync.css',
  './app.js',
  './launcher-sync.js',
  './apps.json',
  './manifest.webmanifest',
  './shared/pocket-works-icon.svg',
  './shared/mobile-runtime.css',
  './shared/mobile-runtime.js',
  './shared/update-manager.css',
  './shared/update-manager.js',
  './shared/view-transition-guard.js',
  './shared/app-icon-previews.css',
  './shared/app-icon-previews.js',
  './shared/launcher-list-motion.css',
  './shared/launcher-list-motion.js'
];

const SCOPE_URL = new URL('./', self.registration.scope);
const APPLICATIONS_PATH = new URL('./apps/', SCOPE_URL).pathname;
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
    throw new Error(`Fresh launcher request failed: ${response?.status || 'network'}`);
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

  // Application directories own their own lifecycle and caches. The root worker
  // must never become a second stale cache in front of them.
  if (requestUrl.pathname.startsWith(APPLICATIONS_PATH)) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstFresh(event.request, SCOPE_URL.href, SCOPE_URL.href));
    return;
  }

  const canonicalUrl = SHELL_KEYS.get(requestUrl.pathname);
  if (!canonicalUrl) return;

  event.respondWith(networkFirstFresh(event.request, canonicalUrl, SCOPE_URL.href));
});
