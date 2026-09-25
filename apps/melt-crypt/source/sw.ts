/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'melt-crypt-';
const CACHE_NAME = 'melt-crypt-v1.0.0';
const APP_VERSION = '1.0.0';
const RELEASE_DATE = '2026-09-25';
const RELEASE_NOTES = [
  'Added a complete first-person roguelike loop with procedural floors, combat, room clearing and descent.',
  'Every monster mutates a procedural body, palette, anatomy, stats and combat ability.',
  'Added pixel-3D rendering, psychedelic lighting, fog, crystals and potion-driven screen effects.',
  'Added relics, bizarre potions, shrines, chests, discoveries, local persistence and touch/desktop controls.'
];

setCacheNameDetails({ prefix: 'melt-crypt', suffix: `v${APP_VERSION}`, precache: 'precache', runtime: 'runtime' });
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') {
    event.ports?.[0]?.postMessage({ version: APP_VERSION, releaseDate: RELEASE_DATE, releaseNotes: RELEASE_NOTES });
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
