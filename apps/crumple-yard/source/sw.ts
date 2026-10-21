/// <reference lib="webworker" />
import { setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'crumple-yard-';
const CACHE_NAME = 'crumple-yard-v1.6.0';
const APP_VERSION = '1.6.0';
const RELEASE_DATE = '2026-10-21';
const RELEASE_NOTES = ["Настоящие локальные вмятины на наружных панелях кузова.","Отдельные трещины стекла и реалистичное отключение разбитых огней.","Следы шин при боковом скольжении, плавное исчезновение и сброс между заездами."];

setCacheNameDetails({ prefix: 'crumple-yard', suffix: 'v' + APP_VERSION, precache: 'precache', runtime: 'runtime' });
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
      .then(() => self.clients.claim())
  );
});

