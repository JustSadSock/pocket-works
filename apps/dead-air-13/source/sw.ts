/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'dead-air-13-';
const CACHE_NAME = 'dead-air-13-v1.1.0';
const APP_VERSION = '1.1.0';
const RELEASE_DATE = '2026-09-26';
const RELEASE_NOTES = [
  'Combat-feel overhaul: ручной огонь с мягким aim assist, более читаемый темп и сильнее отдача попаданий.',
  'Первые три босса получили отдельные визуальные фазы, телеграфы атак и более выразительные переходы.',
  'Воздушное парирование теперь активируется повторным JUMP рядом с розовой угрозой.'
];

setCacheNameDetails({ prefix: 'dead-air-13', suffix: 'v' + APP_VERSION, precache: 'precache', runtime: 'runtime' });
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') {
    event.ports?.[0]?.postMessage({ version: APP_VERSION, releaseDate: RELEASE_DATE, releaseNotes: RELEASE_NOTES, cacheName: CACHE_NAME });
  }
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && !key.includes('v' + APP_VERSION) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => clientsClaim())
  );
});
