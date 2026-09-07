/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'sirocco-';
const CACHE_NAME = 'sirocco-v1.0.1';
const APP_VERSION = '1.0.1';
const RELEASE_DATE = '2026-09-07';
const RELEASE_NOTES = [
  'Исправлен критический баг дальнего LOD: грубый terrain больше не перекрывает активные чанки и не накрывает камеру песчаным потолком.',
  'Дальний ландшафт теперь строится кольцом с гарантированным пустым центром вокруг игрока и корректно центрируется по активному чанку.',
  'Сломанные сохранения камеры из версии 1.0.0 автоматически сбрасываются через новую схему session-state.',
  'Вход в прогулку больше не зависит от успешной инициализации Web Audio: управление запускается сразу, а звук подключается отдельно.'
];

setCacheNameDetails({ prefix: 'sirocco', suffix: `v${APP_VERSION}`, precache: 'precache', runtime: 'runtime' });
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
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && !key.includes(`v${APP_VERSION}`) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => clientsClaim())
  );
});
