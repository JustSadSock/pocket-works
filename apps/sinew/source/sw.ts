/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'sinew-';
const CACHE_NAME = 'sinew-v1.0.0';
const APP_VERSION = '1.0.0';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Новая физическая дуэль: движение слева, всё управление верхом тела — только правым пальцем.',
  'Процедурный риг связан с настоящей Babylon Skeleton/Bone-иерархией; игрок видит собственные ноги, торс, руки, меч и щит.',
  'Swept-контакты клинка различают касание, удар по телу, блок щитом и столкновение мечей; собственное тело имеет анатомический clearance для оружия.',
  'Масса и угловая скорость оружия влияют на устойчивость и отдачу корпуса, а graze больше не съедает следующий полноценный удар.',
  'AI использует тот же контроллер позы, телеграфирует замахи, защищается реальным щитом и реагирует на положение оружия игрока.'
];

setCacheNameDetails({ prefix: 'sinew', suffix: `v${APP_VERSION}`, precache: 'precache', runtime: 'runtime' });
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
