/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'colossus-inside-';
const APP_VERSION = '1.3.0';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Новая contact/traversal physics: реальные бронепластины, разрывы, прыжки и падения вместо непрерывной невидимой поверхности.',
  'Инерция колосса отделена от собственной скорости игрока; добавлены баланс корпуса и корректное наследование движения carrier-иерархии.',
  'Плечевой шарнир получил мировой маяк, экранный указатель и усиленное локальное освещение; Playwright получает диагностическое состояние игры.'
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
