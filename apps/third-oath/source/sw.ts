/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'third-oath-';
const CACHE_NAME = 'third-oath-v0.2.2';
const APP_VERSION = '0.2.2';
const RELEASE_DATE = '2026-10-01';
const RELEASE_NOTES = [
  'Clean top-down визуал с мягкой глубиной вместо перегруженной псевдо-3/4 геометрии.',
  'Стены, пол и пропсы приведены к одной спокойной системе.',
  'Закрытые участки карты теперь скрыты до открытия соответствующих проходов.'
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
