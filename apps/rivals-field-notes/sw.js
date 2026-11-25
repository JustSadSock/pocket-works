const CACHE_PREFIX = 'rivals-field-notes-';
const CACHE_NAME = 'rivals-field-notes-v1.2.0';
const APP_VERSION = '1.2.0';
const RELEASE_DATE = '2026-11-16';
const CACHE_PROTOCOL = 2;
const RELEASE_NOTES = ["Два топ‑10 героев на новом первом экране.", "Обновлены герои, сезоны, дуэты, карты и рекомендации с учётом S11.", "Входящий урон по героям показан отдельно от блокирования."];
const APP_SHELL = ["./workshop.js",
  './',
  './index.html',
  './app.config.json',
  './styles.css',
  './app.js',
  './content.js',
  './data.js',
  './maps.js',
  './research.js',
  './update-content.js',
  './extended.js',
  './extended.css',
  './pocket.css',
  './strength.js',
  './strength.css',
  './snapshot.js',
  './roster.js',
  './roster.css',
  './assets/roster/1016.png',
  './assets/roster/1018.png',
  './assets/roster/1023.png',
  './assets/roster/1025.png',
  './assets/roster/1026.png',
  './assets/roster/1027.png',
  './assets/roster/1029.png',
  './assets/roster/1032.png',
  './assets/roster/1036.png',
  './assets/roster/1038.png',
  './assets/roster/1040.png',
  './assets/roster/1042.png',
  './assets/roster/1043.png',
  './assets/roster/1046.png',
  './assets/roster/1047.png',
  './assets/roster/1050.png',
  './assets/roster/1051.png',
  './assets/roster/1054.png',
  './assets/roster/1058.png',
  './assets/roster/1060.png',

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
