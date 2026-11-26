const CACHE_PREFIX = 'crown-and-marches-';
const CACHE_NAME = 'crown-and-marches-v0.8.0';
const APP_VERSION = '0.8.0';
const RELEASE_DATE = '2026-11-25';
const CACHE_PROTOCOL = 2;
const RELEASE_NOTES = ["Lords & Subjects: сословия, собственность, династии, государственные институты, автономия и гражданские конфликты.","Реформы с реальными административными резервами; компенсированный материальный учёт и пограничные контакты.","The Grand Campaign в разработке: единая кампания, три экспериментальных масштаба мира и делегирование.","IndexedDB с резервной копией, импорт/экспорт; финальная браузерная и мобильная проверка ещё не завершена."];
const APP_SHELL = [
  './',
  './index.html',
  './app.config.json',
  './styles.css',
  './app.js',
  './world.mjs',
  './world-genesis.mjs',
  './genesis-hydrology.mjs',
  './genesis-natural.mjs',
  './genesis-hydrography.mjs',
  './genesis-dem-browser.mjs',
  './genesis-generation.mjs',
  './genesis-generation-worker.mjs',
  './genesis-atlas-visual.mjs',
  './genesis-waters.mjs',
  './genesis-living-visual.mjs',
  './genesis-contours.mjs',
  './world-rendering-gl.mjs',
  './world-rendering-baked.mjs',
  './atlas-campaign-surface.mjs',
  './atlas-projection.mjs',
  './atlas-surface-requests.mjs',
  './atlas-material-fields.mjs',
  './atlas-human-layout.mjs',
  './atlas-human-geography.mjs',
  './atlas-human-control.mjs',
  './atlas-human-content.mjs',
  './atlas-urban-layout.mjs',
  './battle.mjs',
  './render.mjs',
  './geography-review.mjs',
  './landscape-assets.mjs',
  './living-town.mjs',
  './landscape-surface.mjs',
  './urban-surface.mjs',
  './urban-fabric.mjs',
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
