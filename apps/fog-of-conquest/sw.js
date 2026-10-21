const CACHE_PREFIX = 'fog-of-conquest-';
const CACHE_NAME = 'fog-of-conquest-v1.10.0';
const APP_VERSION = '1.10.0';
const RELEASE_DATE = '2026-10-18';
const CACHE_PROTOCOL = 2;
const RELEASE_NOTES = ["Полноценные кампании для всех семи сложностей ИИ: 140 сценариев с реальными картами, экономикой, перемещениями и боями в автоматической проверке.","Из исходного монолитного интерфейса вынесены расчёт тумана войны и память о разведанных строениях в отдельный модуль.","Разведка остаётся приватной при сетевой игре, исторические данные построек не обновляются вне зоны видимости.","Исправлена серверная атака строения, занятого союзным отрядом: армия больше не накладывается на клетку. Новые комнаты используют PocketNet v9."];
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.config.json",
  "./styles.css",
  "./css/style.css",
  "./pocket-adapter.css",
  "./pocket-adapter.js",
  "./pocket-map.js",
  "./pocket-map.css",
  "./pocket-online.js",
  "./battle-events.js",
  "./battle-events.css",
  "./pocket-audio.js",
  "./pocket-visual.js",
  "./pocket-visual.css",
  "../../shared/capabilities/net.js",
  "../../shared/capabilities/identity.js",
  "../../shared/capabilities/maskot.js",
  "../../shared/capabilities/zamazka-achievements.js",
  "./manifest.webmanifest",
  "./manifest.json",
  "./icons/icon.svg",
  "./js/ai.js",
  "./js/dropdown.js",
  "./js/data.js",
  "./js/gameState.js",
  "./js/rules-core.js",
  "./js/fog-controller.js",
  "./js/worldGen.js",
  "./js/replay.js",
  "./js/replay-codec.js",
  "./js/save-schema.js",
  "./js/ui.js",
  "./data/lang/en.json",
  "./data/lang/ru.json",
  "./data/lang/uk.json",
  "./data/units.json",
  "./data/terrain.json",
  "../../shared/mobile-runtime.css",
  "../../shared/mobile-runtime.js",
  "../../shared/update-manager.css",
  "../../shared/update-manager.js",
  "./assets(ai)/archer_ally.png",
  "./assets(ai)/archer_enemy.png",
  "./assets(ai)/field_fortification_enemy.png",
  "./assets(ai)/field_fortifications_ally.png",
  "./assets(ai)/healer_ally.png",
  "./assets(ai)/healer_enemy.png",
  "./assets(ai)/healer_tent_ally.png",
  "./assets(ai)/healer_tent_enemy.png",
  "./assets(ai)/heavy_barracks_ally.png",
  "./assets(ai)/heavy_barracks_enemy.png",
  "./assets(ai)/heavy_warrior_ally.png",
  "./assets(ai)/heavy_warrior_enemy.png",
  "./assets(ai)/horseman_ally.png",
  "./assets(ai)/horseman_enemy.png",
  "./assets(ai)/main_castle_ally.png",
  "./assets(ai)/main_castle_enemy.png",
  "./assets(ai)/stable_ally.png",
  "./assets(ai)/stable_enemy.png",
  "./assets(ai)/tile_grass.png",
  "./assets(ai)/tile_grass_bottom.png",
  "./assets(ai)/tile_hill.png",
  "./assets(ai)/tile_mountain.png",
  "./assets(ai)/tile_trees.png",
  "./assets(ai)/tile_water.png",
  "./assets(ai)/warrior_ally.png",
  "./assets(ai)/warrior_enemy.png",
  "./assets(ai)/windmill_ally.png",
  "./assets(ai)/windmill_enemy.png",
  "./assets/buildings/barracks.png",
  "./assets/buildings/base_ally.png",
  "./assets/buildings/base_enemy.png",
  "./assets/buildings/fort_ally.png",
  "./assets/buildings/fort_enemy.png",
  "./assets/buildings/fort_neutral.png",
  "./assets/buildings/healers_tents_ally.png",
  "./assets/buildings/healers_tents_enemy.png",
  "./assets/buildings/healers_tents_neutral.png",
  "./assets/buildings/stable.png",
  "./assets/buildings/windmill.png",
  "./assets/icon.png",
  "./assets/symbols/green_selection.png",
  "./assets/symbols/red_selection.png",
  "./assets/symbols/white_shield.png",
  "./assets/symbols/yellow_selection.png",
  "./assets/symbols/yellow_shield.png",
  "./assets/tiles/grass1.png",
  "./assets/tiles/grass2.png",
  "./assets/tiles/hill.png",
  "./assets/tiles/hill2.png",
  "./assets/tiles/mountains1.png",
  "./assets/tiles/mountains2.png",
  "./assets/tiles/mountains3.png",
  "./assets/tiles/pound.png",
  "./assets/tiles/pound2.png",
  "./assets/tiles/pound3.png",
  "./assets/tiles/trees1.png",
  "./assets/tiles/trees2.png",
  "./assets/tiles/trees3.png",
  "./assets/tiles/water.png",
  "./assets/units/archer_ally.png",
  "./assets/units/archer_enemy.png",
  "./assets/units/healer_ally.png",
  "./assets/units/healer_enemy.png",
  "./assets/units/heavy_ally.png",
  "./assets/units/heavy_enemy.png",
  "./assets/units/horseman_ally.png",
  "./assets/units/horseman_enemy.png",
  "./assets/units/militia_ally.png",
  "./assets/units/militia_enemy.png"
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
  const urls=[...new Set(SHELL_KEYS.values())];
  let next=0;
  await Promise.all(Array.from({length:6},async()=>{
    while(next<urls.length){
      const url=urls[next++];
      await cache.put(url,await fetchFresh(url));
    }
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
