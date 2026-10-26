const CACHE_PREFIX = 'petri-forge-';
const CACHE_NAME = 'petri-forge-v0.11.0';
const APP_VERSION = '0.11.0';
const RELEASE_DATE = '2026-10-26';
const CACHE_PROTOCOL = 8;
const RELEASE_NOTES = ["PPO-Clip с GAE: нейросеть накапливает опыт целыми партиями, оптимизируется несколько эпох и ограничивает резкие изменения поведения.","PPO, Actor–Critic и Q-learning имеют независимые сохранения, клонирование и перенос JSON; прежние мозги не уничтожаются.","Во время обучения доступны реальные метрики PPO, проверки на новых картах и автоматические тесты математики и восстановлений."];
const APP_SHELL = [
  './',
  './index.html',
  './app.config.json',
  './styles.css',
  './app.js',
  './lab-core.mjs',
  './lab-worker.mjs',
  './neural-policy.mjs',
  './ppo.mjs',
  './model-store.mjs',
  './agent-career.mjs',
  './agent-hub-shell.mjs',
  './agent-hub.mjs',
  './agent-hub.css',
  './agent-cockpit-shell.mjs',
  './agent-cockpit.mjs',
  './agent-cockpit.css',
  './agent-portability.mjs',
  './agent-duel-worker.mjs',
  './agent-transfer.mjs',
  './mode-shell.mjs',
  './world-modes.mjs',
  './world-modes.css',
  './combat-core.mjs',
  './combat-worker.mjs',
  './combat-rules.mjs',
  './combat-editor.mjs',
  './combat-studio.css',
  './perekos-adapter.mjs',
  './perekos-policy.mjs',
  './perekos-training.mjs',
  './perekos-worker-v06.mjs',
  './perekos-shell.mjs',
  './perekos-lab.mjs',
  './perekos-lab.css',
  '../perekos/core.mjs',
  '../perekos/runes.mjs',
  '../perekos/elements.mjs',
  '../perekos/mages.mjs',
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
