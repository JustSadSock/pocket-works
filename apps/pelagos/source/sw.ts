/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'pelagos-';
const CACHE_NAME = 'pelagos-v1.6.3';
const APP_VERSION = '1.6.3';
const RELEASE_DATE = '2026-09-09';
const RELEASE_NOTES = [
  'Океан учитывает фактический размер модульного корпуса и разгружает волну внутри его скрытого объёма.',
  'Носовое поле давления и кормовой след привязаны к реальным носу и транцу вместо фиксированных координат старой модели.',
  'Ватерлиния получила постоянный тонкий мениск, усиливающий ощущение массы даже на малой скорости.',
  'Верфь получила двухосевой осмотр корабля по горизонтали и вертикали.'
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
