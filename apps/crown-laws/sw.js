const CACHE_PREFIX = 'crown-laws-';
const CACHE_NAME = 'crown-laws-v0.7.0';
const APP_VERSION = '0.7.0';
const RELEASE_DATE = '2026-10-23';
const CACHE_PROTOCOL = 2;
const RELEASE_NOTES = ["«Видение советника»: два сценария — неизменные законы и выбранный указ — с мгновенным переключением.","Девять этапов предпросмотра: исходное положение, раскрытие закона, шесть фаз исполнения и результат.","На поле появляются реальные маршруты движения, альтернативные призрачные силуэты и события выбранной фазы.","Условность видения всегда видна: скрытый закон соперника неизвестен. Добавлен отдельный экран видения в мастерскую на тильде."];
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.config.json",
  "./manifest.webmanifest",
  "./app.js",
  "./art-bible.json",
  "./styles.css",
  "./sw.js",
  "./visual-direction.json",
  "./client/app.js",
  "./assets/figures.svg",
  "./assets/law-seals.svg",
  "./assets/royal-hall.svg",
  "./assets/victory-crown.svg",
  "./client/network.js",
  "./client/styles.css",
  "./client/stage05.css",
  "./client/stage06.css",
  "./client/stage07.css",
  "./client/counsel-vision.js",
  "./client/choreography.js",
  "./client/soundscape.js",
  "./assets/court-figures.svg",
  "./assets/throne-relief.svg",
  "./assets/decree-ornament.svg",
  "./icons/icon.png",
  "./icons/icon.svg",
  "./shared/ai.js",
  "./shared/game-data.js",
  "./shared/game-engine.js",
  "../../shared/mobile-runtime.css",
  "../../shared/mobile-runtime.js",
  "../../shared/update-manager.js",
  "../../shared/update-manager.css",
  "../../shared/capabilities/net.js"
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
