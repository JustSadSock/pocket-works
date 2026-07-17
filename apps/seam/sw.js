const CACHE_PREFIX = 'seam-';
const CACHE_NAME = 'seam-v2.2.0-p5';
const APP_VERSION = '2.2.0';
const RELEASE_DATE = '2026-07-17';
const CACHE_PROTOCOL = 5;
const RELEASE_NOTES = [
  'Выбитые обычные бойцы теперь уходят в резерв и возвращаются через поддержанную клетку домашнего края.',
  'Для удержания центра нужны четыре союзника и три ответных хода, поэтому таран и позиционная игра действительно конкурируют.',
  'Два независимых финальных прогона по 60 партий дали 62:58 по местам, ноль ничьих и два жизнеспособных способа победы.'
];
const APP_SHELL = [
  './', './index.html', './app.config.json', './styles.css', './reserve.css', './motion.css', './app.js', './motion.js', './engine.js', './engine-core.js',
  './manifest.webmanifest', './icons/icon.svg', './BALANCE_AUDIT.md',
  '../../shared/mobile-runtime.css', '../../shared/mobile-runtime.js',
  '../../shared/pwa-utils.js', '../../shared/update-manager.css', '../../shared/update-manager.js',
  '../../shared/workshop-mode.css', '../../shared/workshop-mode.js'
];
const SCOPE_URL = new URL('./', self.registration.scope);
const BUILD_TOKEN = `${APP_VERSION}-p${CACHE_PROTOCOL}`;
const SHELL_KEYS = new Map(APP_SHELL.map((entry) => {
  const url = new URL(entry, SCOPE_URL);
  return [url.pathname, url.href];
}));
function networkUrl(input) {
  const url = new URL(input instanceof Request ? input.url : input, SCOPE_URL);
  url.searchParams.set('__pw_build', BUILD_TOKEN);
  return url;
}
async function fetchFresh(input) {
  const response = await fetch(networkUrl(input), { cache: 'no-store', credentials: 'same-origin', redirect: 'follow' });
  if (!response?.ok) throw new Error(`Fresh request failed: ${response?.status || 'network'}`);
  return response;
}
async function precache() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all([...new Set(SHELL_KEYS.values())].map(async (url) => cache.put(url, await fetchFresh(url))));
}
async function networkFirst(request, canonical, fallback = canonical) {
  try {
    const response = await fetchFresh(request);
    const cache = await caches.open(CACHE_NAME);
    await cache.put(canonical, response.clone());
    return response;
  } catch {
    return (await caches.match(canonical)) || caches.match(fallback);
  }
}
self.addEventListener('install', (event) => event.waitUntil(precache()));
self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') event.ports?.[0]?.postMessage({ version: APP_VERSION, releaseDate: RELEASE_DATE, releaseNotes: RELEASE_NOTES, cacheProtocol: CACHE_PROTOCOL, cacheName: CACHE_NAME });
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, SCOPE_URL.href, SCOPE_URL.href));
    return;
  }
  const canonical = SHELL_KEYS.get(url.pathname);
  if (canonical) event.respondWith(networkFirst(event.request, canonical, SCOPE_URL.href));
});
