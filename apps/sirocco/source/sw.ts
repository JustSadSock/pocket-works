/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };
const CACHE_PREFIX = 'sirocco-';
const CACHE_NAME = 'sirocco-v1.5.0';
const APP_VERSION = '1.5.0';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Физический песок значительно оптимизирован для iPhone/Safari: локальная High-сетка стала примерно втрое дешевле, а avalanche и coarse mesh больше не перестраиваются почти каждый кадр.',
  'Зона рендера вокруг игрока убрана радиальной replacement-поверхностью, плавным затуханием деформации и непрерывным far terrain без квадратного отверстия.',
  'Модель бедуина получила фактуру ткани и кожи, ремень через плечо, сумку, бурдюк, дополнительные слои одежды и лёгкое движение с походкой.',
  'Обновлены мобильные quality budgets и Playwright-регрессии производительности, WebKit, физического песка и персонажа.'
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
