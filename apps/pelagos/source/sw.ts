/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'pelagos-';
const CACHE_NAME = 'pelagos-v1.1.0';
const APP_VERSION = '1.1.0';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Корпус получил динамическую мокрую ватерлинию, локальную контактную пену и кильватер с памятью, поэтому движение теперь оставляет видимый физический след в море.',
  'Руль, рыскание и удары носом получили дополнительную инерцию: косая зыбь слегка сносит курс, а встреча с гребнем отнимает импульс вместо скольжения сквозь волну.',
  'Море стало пространственно неоднородным: крупные группы зыби чередуются со спокойными участками, появились ветровые полосы, редкие дальние шквалы и морские птицы.',
  'Дерево, парусина, металл, освещение, камера и звук переработаны вокруг нагрузки: мокрые поверхности блестят иначе, рангоут живёт под ветром, а корпус, снасти и вёсла звучат по фактическому движению.'
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
