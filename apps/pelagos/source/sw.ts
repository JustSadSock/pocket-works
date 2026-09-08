/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'pelagos-';
const CACHE_NAME = 'pelagos-v1.6.1';
const APP_VERSION = '1.6.1';
const RELEASE_DATE = '2026-09-09';
const RELEASE_NOTES = [
  'Верфь теперь оставляет корабль в кадре: компактная нижняя панель и отдельная камера дают живой предпросмотр каждого изменения.',
  'Корпус получил более тяжёлую вертикальную динамику и перестал следовать за каждой локальной волной как поплавок.',
  'Кормовая ватерлиния ограничивает и дифферент, и общий подъём корпуса, удерживая транец и руль в воде.',
  'Руль посажен глубже и появляется над поверхностью только при действительно сильном оголении.'
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
