/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'pelagos-';
const CACHE_NAME = 'pelagos-v1.5.0';
const APP_VERSION = '1.5.0';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Корабль переведён на модульный loadout: размер корпуса, цветовая схема, парусный план и гребной комплект теперь независимы и могут заменяться без переписывания сцены.',
  'Текущий Long Cutter увеличен до 12,8 м длины и 3,9 м ширины; гребной банк расширен до шести вёсел на каждый борт с отдельными портами и водяными контактами.',
  'Плавучесть получила long-hull фильтрацию волн, связанную модель heave/pitch/roll и ограничитель отрыва корпуса от воды, чтобы корму больше не подбрасывало на гребнях.',
  'Рулевая лопасть опущена к рабочей ватерлинии и теперь почти полностью остаётся под водой даже при заметной килевой качке.'
];

setCacheNameDetails({
  prefix: 'pelagos',
  suffix: `v${APP_VERSION}`,
  precache: 'precache',
  runtime: 'runtime'
});

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
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME && !key.includes(`v${APP_VERSION}`))
          .map((key) => caches.delete(key))
      ))
      .then(() => clientsClaim())
  );
});