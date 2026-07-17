const CACHE_PREFIX = 'seam-';
const CACHE_NAME = 'seam-v2.1.0-p4';
const APP_VERSION = '2.1.0';
const RELEASE_DATE = '2026-07-17';
const CACHE_PROTOCOL = 4;
const RELEASE_NOTES = [
  'Экран ожидания компьютера заменён компактным статусом, который не закрывает поле.',
  'Добавлены анимации перемещения формаций, толчков, вылета, смены хода и удержания центра.',
  'Motion-слой учитывает системное уменьшение движения и не меняет проверенную игровую механику.'
];
const APP_SHELL = [
  './', './index.html', './app.config.json', './styles.css', './motion.css', './app.js', './motion.js', './engine.js',
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
