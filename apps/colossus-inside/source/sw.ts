/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'colossus-inside-';
const APP_VERSION = '1.5.0';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Колосс стал движущимся уровнем: маршрутные carrier-узлы синхронизируются с Blender armature.',
  'Системные ledge grabs работают на обычных разрывах брони, а импульс поверхности влияет на баланс и положение игрока.',
  'Lightning set piece разрушает секцию корпуса; ремонт стабилизатора теперь состоит из трёх отдельных фаз синхронизации.',
  'Обновлены камера, world-guidance, scale cues, внутренние механизмы и финальная стабилизация.'
];

setCacheNameDetails({ prefix: 'colossus-inside', suffix: `v${APP_VERSION}`, precache: 'precache', runtime: 'runtime' });
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
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && !key.includes(`v${APP_VERSION}`))
        .map((key) => caches.delete(key))
    )).then(() => clientsClaim())
  );
});
