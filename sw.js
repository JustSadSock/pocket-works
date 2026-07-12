const CACHE_PREFIX = 'pocket-works-launcher-';
const CACHE_NAME = 'pocket-works-launcher-v0.5.0';
const APP_VERSION = '0.5.0';
const RELEASE_DATE = '2026-07-12';
const RELEASE_NOTES = [
  'Rebuilt the launcher as a searchable personal application shelf.',
  'Added saved applications, recents, filters, release details and quick actions.',
  'Added procedural previews and live offline-readiness indicators.'
];
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './apps.json',
  './manifest.webmanifest',
  './shared/pocket-works-icon.svg',
  './shared/mobile-runtime.css',
  './shared/mobile-runtime.js',
  './shared/update-manager.css',
  './shared/update-manager.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') {
    event.ports?.[0]?.postMessage({
      version: APP_VERSION,
      releaseDate: RELEASE_DATE,
      releaseNotes: RELEASE_NOTES
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

async function networkFirst(request, fallback = './') {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const copy = response.clone();
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request.mode === 'navigate' ? fallback : request, copy);
    }
    return response;
  } catch {
    return caches.match(request).then((cached) => cached || caches.match(fallback));
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, './'));
    return;
  }

  if (requestUrl.pathname.endsWith('/apps.json')) {
    event.respondWith(networkFirst(event.request, './apps.json'));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
