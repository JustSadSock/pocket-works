const CACHE_PREFIX = 'pocket-works-launcher-';
const CACHE_NAME = 'pocket-works-launcher-v0.12.0';
const APP_VERSION = '0.12.0';
const RELEASE_DATE = '2026-10-16';
const CACHE_PROTOCOL = 8;
const RELEASE_NOTES = [
  'Каталог с узнаваемыми иконками, единая главная для телефона и компьютера, согласованные окна и быстрый запуск.',
  'Скриншоты в подробностях, наглядный редактор подборок и единое управление личной и общей коллекцией.',
  'Administrators can pin and unpin games for everyone; pinned games lead the shared Library and Quick play.',
  'Pocket Social 0.11: join verified friends in live PocketNet lobbies, invite a saved company, and see friends online on Home.',
  'Pocket Social: compact live friend checks, better mobile cards, resilient search, invitations and offline status.',
  'MASKOT: refitted full-size medieval bascinet and herald outfit, improved waistcoat; secret GROOM-2026 wedding tuxedo.',
  'ZAMAZKA: seven server-verified achievements and real collectible profile rewards.',
  'MASKOT: hand-drawn medieval bascinet and embroidered heraldic tabard, available through two verified gift codes.',
  'Profile Card Studio: separate painted and preset backgrounds, framed mascots, large touch canvas with undo, eraser and adjustable brush.',
  'A collectible MASKOT profile editor with animal characters, outfits, and server-verified secret cosmetics.',
  'A redesigned Pocket Deck home screen with movable and configurable widgets.',
  'Dense visual Contact Sheet library, reversible archive and project development notes.',
  'Persistent Pocket ID profiles, unique nicknames, avatar badges, and optional Google sign-in.',
  'Public privacy policy for Pocket ID accounts, Google sign-in and local applications.',
  'Pocket ID identity across multiplayer games, profile links and verified account badges.',
  'Pocket Social player cards, drawn portraits, friends, presence and verified room invitations.',
  'Unified Pocket ID profile editor, account settings and personal portraits across supported games.',
  'iPhone top touch safe zone for Safari and Home Screen PWA, including a standalone status bar fallback.',
  'Pocket ID modal: close buttons are always reachable below the iPhone status bar, with an additional bottom exit.',
  'Pocket Cloud storage meter: live per-account usage, available space, FOLIO/Zamazka breakdown and saved-item inventory.',
  'Focus-first UI: quiet Home, concise game details, compact library filters and friend screens.',
  'Compact one-screen mobile home, prominent Pocket ID, actual notification dots and tap-to-play library.',
  'Server-authorized global archiving for Pocket ID administrators; all users see the same shared archive.',
  'Single-use Pocket ID activation codes grant persistent server-side account entitlements.',
  'Bulk-select games from Home to save, archive personally or manage the shared archive with administrator confirmation.'
];
const APP_SHELL = [
  './', './index.html', './privacy.html', './styles.css', './deck-shell.css', './covers/index.json', './launcher-performance.css', './launcher-sync.css', './app.js',
  './launcher-new-app-focus.js', './launcher-update-all-v3.js', './launcher-release-links.js', './launcher-sync.js', './apps.json', './manifest.webmanifest',
  './shared/catalog-art.js', './shared/catalog-art/art-cabinet.svg', './shared/catalog-art/oskolki.svg', './shared/catalog-art/ne-tem-golosom.svg',
  './shared/deck-batch.js', './shared/capabilities/identity.js', './shared/capabilities/maskot.js', './shared/capabilities/zamazka-achievements.js', './shared/capabilities/card-studio.js', './shared/capabilities/identity.css', './shared/pocket-id.css', './shared/pocket-id.js', './shared/pocket-social.css', './shared/pocket-social.js', './shared/pocket-works-icon.svg', './shared/pocket-deck.js', './shared/deck-state.js', './shared/launcher-registry.js', './shared/shelf-state.js', './shared/shell-tools.js', './shared/launcher-dom-reconcile.js', './shared/offline-readiness.js', './shared/release-coordinator.js', './shared/mobile-runtime.css', './shared/mobile-runtime.js',
  './shared/update-manager.css', './shared/update-manager.js', './shared/release-guard.js', './shared/view-transition-guard.js',
  './shared/app-icon-previews.css', './shared/app-icon-previews.js', './shared/launcher-list-motion.css', './shared/launcher-list-motion.js'
];

const SCOPE_URL = new URL('./', self.registration.scope);
const APPLICATIONS_PATH = new URL('./apps/', SCOPE_URL).pathname;
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
  const response = await fetch(buildNetworkUrl(input), {
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'follow'
  });
  if (!response?.ok) throw new Error(`Fresh launcher request failed: ${response?.status || 'network'}`);
  return response;
}

async function precacheFreshShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all([...new Set(SHELL_KEYS.values())].map(async (canonicalUrl) => {
    await cache.put(canonicalUrl, await fetchFresh(canonicalUrl));
  }));
}

async function networkFirstFresh(request, canonicalUrl, fallbackUrl = canonicalUrl) {
  try {
    const response = await fetchFresh(request);
    const cache = await caches.open(CACHE_NAME);
    await cache.put(canonicalUrl, response.clone());
    return response;
  } catch {
    return (await caches.match(canonicalUrl)) || (await caches.match(fallbackUrl)) || Response.error();
  }
}

self.addEventListener('install', (event) => event.waitUntil(precacheFreshShell()));
self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') {
    event.ports?.[0]?.postMessage({ version: APP_VERSION, releaseDate: RELEASE_DATE, releaseNotes: RELEASE_NOTES, cacheProtocol: CACHE_PROTOCOL, cacheName: CACHE_NAME });
  }
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', (event) => event.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== location.origin) return;
  // Read-only artwork copies belong to the launcher cache, never to app caches.
  if(requestUrl.pathname.startsWith(APPLICATIONS_PATH) && /\/icons\/icon\.svg$/.test(requestUrl.pathname)){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE_NAME);
      const cached=await cache.match(event.request);
      if(cached)return cached;
      try{const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;}
      catch{return Response.error();}
    })());return;
  }
  if (requestUrl.pathname.startsWith(APPLICATIONS_PATH)) return;
  if (requestUrl.pathname.startsWith('/pocket-id/') || requestUrl.pathname.startsWith('/pocketnet/') || requestUrl.pathname.startsWith('/pocket-cloud/') || requestUrl.pathname.startsWith('/pocket-social/')) return;
  if (requestUrl.pathname === '/privacy' || requestUrl.pathname === '/privacy.html') {
    const policyUrl = new URL('./privacy.html', SCOPE_URL).href;
    event.respondWith(networkFirstFresh(event.request, policyUrl, policyUrl));
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstFresh(event.request, SCOPE_URL.href, SCOPE_URL.href));
    return;
  }
  const coverPath=new URL('./covers/',SCOPE_URL).pathname;
  if(requestUrl.pathname.startsWith(coverPath) && /\.(?:png|jpe?g|webp)$/i.test(requestUrl.pathname)){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE_NAME);
      const cached=await cache.match(event.request);
      const refresh=fetch(event.request).then(async response=>{
        if(response.ok)await cache.put(event.request,response.clone());
        return response;
      });
      if(cached){
        // Display immediately when offline or on a repeat visit, but refresh
        // changed screenshot art in the background for the next opening.
        event.waitUntil(refresh.catch(()=>{}));
        return cached;
      }
      try{return await refresh;}catch{return Response.error();}
    })());
    return;
  }
  const canonicalUrl = SHELL_KEYS.get(requestUrl.pathname);
  if (canonicalUrl) event.respondWith(networkFirstFresh(event.request, canonicalUrl, SCOPE_URL.href));
});
