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
  'Корабль переведён на модульную архитектуру: класс корпуса, окраска, парусный комплект и гребной комплект теперь описаны отдельными судовыми модулями и сохраняются через новую Верфь.',
  'PELAGOS Cutter 30 получил фиксированный физический масштаб: корпус 9.13 м, ширина 3.48 м, полная длина около 11.7 м и водоизмещение около 5.6 т.',
  'Базовый гребной комплект увеличен до шести пар — двенадцати физических вёсел — с отдельными уключинами, втягиванием под планширь, флюгированием и тягой только при контакте лопасти с локальной волной.',
  'Гидродинамика получила added-water mass, широкую опорную плоскость корпуса и контроль погружения кормы, чтобы короткая волна не катапультировала судно и не оголяла рулевое устройство.',
  'Blender-катер дополнительно насыщен работающими деталями: штурвал, компас, фонари, колокол, блоки, якоря и динамические шкоты связаны с фактическим состоянием судна.'
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
