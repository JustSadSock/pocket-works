/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'pelagos-';
const CACHE_NAME = 'pelagos-v1.3.0';
const APP_VERSION = '1.3.0';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Убраны старые wet-band ленты под Blender-корпусом, которые на гребне волны выглядели как чёрные плавники под кормой.',
  'Восемь вёсел получили уключины как фиксированные шарниры, медленный рабочий ход, уборку внутрь корпуса и тягу только при реальном контакте лопасти с локальной волной.',
  'В море появился плотный процедурный слой ориентиров: дрейфующие брёвна, бочки, ящики, буи и пятна водорослей покачиваются на том же волновом поле и дают заметный параллакс.',
  'Новые близкие ориентиры делают разгон, торможение и поворот визуально читаемыми даже вдали от суши, не превращая открытое море в островную карту.'
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