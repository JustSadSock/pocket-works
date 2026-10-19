const CACHE_PREFIX = 'skyforge-relay-';
const CACHE_NAME = 'skyforge-relay-v0.1.0';
const APP_VERSION = '0.1.0';
const RELEASE_DATE = '2026-10-18';
const CACHE_PROTOCOL = 2;
const RELEASE_NOTES = ["Перенесена исходная игра с сохранением правил и отдельным хранением данных."];
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.config.json",
  "./manifest.webmanifest",
  "./app.js",
  "./art-bible.json",
  "./game.js",
  "./network.js",
  "./simulation.js",
  "./styles.css",
  "./sw.js",
  "./visual-direction.json",
  "./icons/icon.svg",
  "./icons/source.svg",
  "./assets/sounds/boss_alert.wav",
  "./assets/sounds/collect.wav",
  "./assets/sounds/dash.wav",
  "./assets/sounds/deposit.wav",
  "./assets/sounds/enemy_shot.wav",
  "./assets/sounds/explosion.wav",
  "./assets/sounds/heal.wav",
  "./assets/sounds/hit.wav",
  "./assets/sounds/lose.wav",
  "./assets/sounds/pickup.wav",
  "./assets/sounds/pulse.wav",
  "./assets/sounds/shield.wav",
  "./assets/sounds/terminal.wav",
  "./assets/sounds/win.wav",
  "./assets/sprites/bg_nebula.png",
  "./assets/sprites/enemy_boss.png",
  "./assets/sprites/enemy_brute.png",
  "./assets/sprites/enemy_drone.png",
  "./assets/sprites/enemy_scout.png",
  "./assets/sprites/enemy_sniper.png",
  "./assets/sprites/energy_orb.png",
  "./assets/sprites/fx_explosion.png",
  "./assets/sprites/heal_beacon.png",
  "./assets/sprites/pickup_medkit.png",
  "./assets/sprites/pickup_overclock.png",
  "./assets/sprites/pickup_shield.png",
  "./assets/sprites/player_blue.png",
  "./assets/sprites/player_green.png",
  "./assets/sprites/player_orange.png",
  "./assets/sprites/player_purple.png",
  "./assets/sprites/proj_enemy.png",
  "./assets/sprites/proj_player.png",
  "./assets/sprites/prop_crate.png",
  "./assets/sprites/prop_rock.png",
  "./assets/sprites/pulse_blast.png",
  "./assets/sprites/reactor_core.png",
  "./assets/sprites/terminal_beacon.png",
  "./assets/sprites/tile_floor.png",
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
