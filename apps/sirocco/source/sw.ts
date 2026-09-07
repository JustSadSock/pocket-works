/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'sirocco-';
const CACHE_NAME = 'sirocco-v1.0.0';
const APP_VERSION = '1.0.0';
const RELEASE_DATE = '2026-09-07';
const RELEASE_NOTES = [
  'Процедурная бесшовная пустыня и стриминг дюн.',
  'Humanoid body awareness, foot IK и физически читаемые следы.',
  'Локальное осыпание песка и адаптивный мобильный рендер.'
];

setCacheNameDetails({ prefix: 'sirocco', suffix: `v${APP_VERSION}`, precache: 'precache', runtime: 'runtime' });
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
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && !key.includes(`v${APP_VERSION}`) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => clientsClaim())
  );
});
