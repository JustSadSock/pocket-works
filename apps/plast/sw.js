const CACHE_PREFIX = 'plast-';
const CACHE_NAME = 'plast-v1.1.0-p2';
const APP_VERSION = '1.1.0';
const RELEASE_DATE = '2026-07-26';
const CACHE_PROTOCOL = 2;
const RELEASE_NOTES = [
  'Динамические сутки со звёздами, луной и меняющимся освещением.',
  'Объёмные овцы, свиньи, коровы и куры с ходьбой и реакцией на игрока.',
  'Здоровье, сытость, воздух, падения, утопление, еда и возрождение.',
  'Бег, скрытное движение у края, покачивание камеры и расширение обзора.',
  'Частицы, трещины при добыче и расширенное автосохранение.'
];
const APP_SHELL = [
  './', './index.html', './app.config.json', './styles.css', './living.css',
  './app-core.js', './app-living-a.js', './app-living-b.js',
  './app-world-a.js', './app-world-b.js', './app-world-c.js',
  './app-ui-a.js', './app-ui-b.js', './app.js',
  './manifest.webmanifest', './icons/icon.svg',
  '../../shared/mobile-runtime.css', '../../shared/update-manager.css', '../../shared/update-manager.js'
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
  const response = await fetch(buildNetworkUrl(input), {cache:'no-store', credentials:'same-origin', redirect:'follow'});
  if (!response || !response.ok) throw new Error(`Fresh application request failed: ${response?.status || 'network'}`);
  return response;
}
async function precacheFreshShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all([...new Set(SHELL_KEYS.values())].map(async (canonicalUrl) => {
    const response = await fetchFresh(canonicalUrl);
    await cache.put(canonicalUrl, response);
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
  if (event.data?.type === 'GET_UPDATE_INFO') event.ports?.[0]?.postMessage({version:APP_VERSION, releaseDate:RELEASE_DATE, releaseNotes:RELEASE_NOTES, cacheProtocol:CACHE_PROTOCOL, cacheName:CACHE_NAME});
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') return event.respondWith(networkFirstFresh(event.request, SCOPE_URL.href, SCOPE_URL.href));
  const canonicalUrl = SHELL_KEYS.get(requestUrl.pathname);
  if (canonicalUrl) event.respondWith(networkFirstFresh(event.request, canonicalUrl, SCOPE_URL.href));
});
