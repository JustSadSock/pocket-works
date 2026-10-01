/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'third-oath-';
const CACHE_NAME = 'third-oath-v0.2.0';
const APP_VERSION = '0.2.0';
const RELEASE_DATE = '2026-10-01';
const RELEASE_NOTES = [
  'Глава II: старая башня, колокольный ярус, реестр имён и встреча с Элином.',
  'Безгласные, Смотрящие и Носитель печати добавляют ближние и дальние угрозы.',
  'Три варианта судьбы башенной печати зависят от прежних решений и найденных улик.'
];

setCacheNameDetails({ prefix: 'third-oath', suffix: 'v' + APP_VERSION, precache: 'precache', runtime: 'runtime' });
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') {
    event.ports?.[0]?.postMessage({ version: APP_VERSION, releaseDate: RELEASE_DATE, releaseNotes: RELEASE_NOTES, cacheName: CACHE_NAME });
  }
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && !key.includes('v' + APP_VERSION) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => clientsClaim())
  );
});
