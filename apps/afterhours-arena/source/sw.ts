/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'afterhours-arena-';
const CACHE_NAME = 'afterhours-arena-v0.1.0';
const APP_VERSION = '0.1.0';
const RELEASE_DATE = '2026-10-07';
const RELEASE_NOTES = ['Первый ночной турнир: два бойца, блок, прыжки, спецприёмы и поединок до двух побед.'];

setCacheNameDetails({
  prefix: 'afterhours-arena',
  suffix: `v${APP_VERSION}`,
  precache: 'precache',
  runtime: 'runtime'
});

// Production adds release/fingerprint query parameters to every asset URL.
// Treat those as cache aliases and include the injected shared boot guard.
precacheAndRoute([
  ...self.__WB_MANIFEST,
  { url: '../../shared/release-guard.js', revision: APP_VERSION }
], { ignoreURLParametersMatching: [/^pw_/, /^utm_/, /^fbclid$/] });
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
// The platform guard checks release metadata at boot, including offline boots.
// Keep the last real server response under our own cache namespace.
registerRoute(({ url }) => url.origin === self.location.origin && url.pathname === new URL('release.json', self.location.href).pathname,
  async ({ request }) => {
    const cache = await caches.open(`${CACHE_PREFIX}release-v${APP_VERSION}`);
    const key = new URL(request.url); key.search = '';
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(key.href, response.clone());
      return response;
    } catch {
      return await cache.match(key.href) ?? new Response(JSON.stringify({ version: APP_VERSION }), { headers: { 'Content-Type': 'application/json' } });
    }
  });

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') {
    event.ports?.[0]?.postMessage({
      version: APP_VERSION,
      releaseDate: RELEASE_DATE,
      releaseNotes: RELEASE_NOTES
    });
  }
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && !key.includes(`v${APP_VERSION}`) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => clientsClaim())
  );
});
