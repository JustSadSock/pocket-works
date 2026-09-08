/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };
const CACHE_PREFIX = 'sirocco-';
const CACHE_NAME = 'sirocco-v1.6.0';
const APP_VERSION = '1.6.0';
const RELEASE_DATE = '2026-09-09';
const RELEASE_NOTES = [
  'Песок v2 различает рыхлый и уплотнённый слой: свежий валик осыпается, повторный след уплотняется и становится твёрже.',
  'Передвижение реагирует на состояние поверхности: рыхлый песок сильнее замедляет и погружает ноги, утоптанный след даёт более уверенную опору.',
  'Обновлены материалы и слои одежды бедуина: выцветание, пыль, узорный шарф и дополнительный пояс без пересечений с камерой.',
  'Playwright Chromium/WebKit теперь дополнительно проверяет CPU-бюджет песка, рыхлость, уплотнение и повторные следы.'
];
setCacheNameDetails({ prefix: 'sirocco', suffix: `v${APP_VERSION}`, precache: 'precache', runtime: 'runtime' });
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') event.ports?.[0]?.postMessage({ version: APP_VERSION, releaseDate: RELEASE_DATE, releaseNotes: RELEASE_NOTES });
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith(CACHE_PREFIX) && !key.includes(`v${APP_VERSION}`) && key !== CACHE_NAME)
    .map((key) => caches.delete(key)))).then(() => clientsClaim()));
});
