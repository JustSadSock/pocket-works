/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'whistle-90-';
const CACHE_NAME = 'whistle-90-v1.0.1';
const APP_VERSION = '1.0.1';
const RELEASE_DATE = '2026-07-20';
const RELEASE_NOTES = [
  'Исправлен фриз игрового цикла на iPhone и в standalone-режиме.',
  'Canvas-рендер и таймерный цикл больше не зависят от проблемного mobile RAF.',
  'Матч автоматически восстанавливается после возврата в приложение.'
];

setCacheNameDetails({ prefix: 'whistle-90', suffix: `v${APP_VERSION}`, precache: 'precache', runtime: 'runtime' });
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
