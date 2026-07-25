const CACHE_PREFIX = 'clada-';
const CACHE_NAME = 'clada-v4.0.0';
const APP_VERSION = '4.0.0';
const RELEASE_DATE = '2026-07-26';
const CACHE_PROTOCOL = 7;
const RELEASE_NOTES = [
  'Макропопуляции, ресурсы и занятые территории стали источником истины; экранные существа теперь являются устойчивой визуальной выборкой, а не всей мировой популяцией.',
  'Морские пищевые сети получили отдельный планктонный ресурс и водные маршруты расселения; хищники используют насыщаемую функциональную реакцию, переключение добычи и внутривидовую интерференцию.',
  'Добавлены редкие волны колонизации, локальные вымирания и повторное заселение, конкуренция за общую ёмкость ниши и экологическая радиация выживших линий.',
  'В меню появился компактный диагностический экспорт для воспроизведения пользовательских миров; тесты используют то же ядро, что и приложение.'
];
const APP_SHELL = [
  './', './index.html', './app.config.json', './styles.css', './living.css', './app.js', './manifest.webmanifest', './icons/icon.svg', './workshop.js',
  './runtime/01-core.js', './runtime/02-life.js', './runtime/03-simulation.js', './runtime/04-history.js',
  './runtime/05-inspector.js', './runtime/06-views.js', './runtime/07-render.js', './runtime/08-controls.js', './runtime/09-evolution-v2.js',
  './runtime/v3/10-01.txt', './runtime/v3/10-02.txt', './runtime/v3/10-03.txt', './runtime/v3/10-04.txt', './runtime/v3/11-01.txt', './runtime/v3/11-02.txt', './runtime/v3/11-03-1.txt', './runtime/v3/11-03-2.txt', './runtime/v3/11-03-3.txt', './runtime/v3/11-04.txt', './runtime/v3/11-05-1.txt', './runtime/v3/11-05-2.txt', './runtime/v3/11-05-3.txt', './runtime/v3/11-06.txt', './runtime/v3/12-01.txt', './runtime/v3/12-02.txt', './runtime/v3/12-03.txt', './runtime/v3/12-04.txt', './runtime/v3/12-05.txt', './runtime/v3/13-stability.txt', './runtime/v3/14-diversification-core.js', './runtime/v3/15-01.txt', './runtime/v3/15-02.txt', './runtime/v3/15-03.txt',
  './runtime/v4/16-01.txt', './runtime/v4/16-02.txt', './runtime/v4/16-03.txt', './runtime/v4/16-04.txt', './runtime/v4/17-01.txt', './runtime/v4/17-02.txt', './runtime/v4/17-03.txt',
  '../../shared/mobile-runtime.css', '../../shared/mobile-runtime.js', '../../shared/pwa-utils.js', '../../shared/update-manager.css', '../../shared/update-manager.js',
  '../../shared/workshop-mode.css', '../../shared/workshop-mode.js', '../../shared/capabilities/motion.js', '../../shared/capabilities/storage.js',
  '../../shared/capabilities/transfer.js', '../../shared/capabilities/audio.js', '../../shared/capabilities/device.js', '../../shared/capabilities/diagnostics.js'
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
  const response = await fetch(buildNetworkUrl(input), { cache: 'no-store', credentials: 'same-origin', redirect: 'follow' });
  if (!response?.ok) throw new Error(`Fresh application request failed: ${response?.status || 'network'}`);
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
  if (event.data?.type === 'GET_UPDATE_INFO') event.ports?.[0]?.postMessage({ version: APP_VERSION, releaseDate: RELEASE_DATE, releaseNotes: RELEASE_NOTES, cacheProtocol: CACHE_PROTOCOL, cacheName: CACHE_NAME });
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
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
  if (canonicalUrl) event.respondWith(networkFirstFresh(event.request, canonicalUrl, SCOPE_URL.href));
});
