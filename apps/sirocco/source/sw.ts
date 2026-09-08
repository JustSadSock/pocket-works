/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };
const CACHE_PREFIX = 'sirocco-';
const CACHE_NAME = 'sirocco-v1.6.0';
const APP_VERSION = '1.6.0';
const RELEASE_DATE = '2026-09-09';
const RELEASE_NOTES = [
  'Песок v2 различает рыхлый и уплотнённый слой: свежие валики осыпаются, повторный след уплотняется и становится твёрже.',
  'Локальная сетка сгущает тот же vertex budget вокруг ног, поэтому следы плавнее без возврата старых лагов.',
  'Sand physics сам снижает avalanche/settling budget при дорогом WebKit-тике и постепенно восстанавливает его.',
  'Бедуин получил отдельную фактуру кожи, льна и куфии, а first-person камера ещё надёжнее вынесена из головы.',
  'Chromium/WebKit QA проверяет физический песок, тело, экстремальную камеру, Blender-окружение и CPU-бюджет.'
];
setCacheNameDetails({ prefix: 'sirocco', suffix: `v${APP_VERSION}`, precache: 'precache', runtime: 'runtime' });
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') event.ports?.[0]?.postMessage({ version: APP_VERSION, releaseDate: RELEASE_DATE, releaseNotes: RELEASE_NOTES });
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith(CACHE_PREFIX) && !key.includes(`v${APP_VERSION}`) && key !== CACHE_NAME)
    .map((key) => caches.delete(key)))).then(() => clientsClaim()));
});
