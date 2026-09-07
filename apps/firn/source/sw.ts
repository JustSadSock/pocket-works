/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };
const CACHE_PREFIX = 'firn-';
const CACHE_NAME = 'firn-v1.0.0';
const APP_VERSION = '1.0.0';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Процедурные снежные горы с хребтами, седловинами, плато и продуваемыми зонами.',
  'Тип снега влияет на глубину шага, скорость, сцепление, скольжение и следы.',
  'Свежие следы реально деформируют локальную высокодетальную снежную поверхность.',
  'Добавлены позёмка, снежные срывы, адаптивное качество, мобильное touch-управление и генеративный звук.'
];

setCacheNameDetails({ prefix: 'firn', suffix: `v${APP_VERSION}`, precache: 'precache', runtime: 'runtime' });
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') event.ports?.[0]?.postMessage({ version: APP_VERSION, releaseDate: RELEASE_DATE, releaseNotes: RELEASE_NOTES });
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith(CACHE_PREFIX) && !key.includes(`v${APP_VERSION}`) && key !== CACHE_NAME).map((key) => caches.delete(key))
  )).then(() => clientsClaim()));
});
