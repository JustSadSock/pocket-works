/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };
const CACHE_PREFIX = 'sirocco-';
const CACHE_NAME = 'sirocco-v1.0.4';
const APP_VERSION = '1.0.4';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Исправлена настоящая причина изнанки дюн: winding всех terrain-треугольников был обратным стандартному Babylon.js TiledGround, поэтому верх песка отбрасывался back-face culling, а игрок видел поверхность только снизу.',
  'Ближние чанки и дальний LOD теперь используют тот же top-facing порядок индексов, что встроенный Babylon.js ground для XZ-сетки с растущей координатой Z.',
  'Тем же исправлением приведены в правильную ориентацию геометрические следы и локальные следы осыпания песка.',
  'Добавлен регрессионный тест winding и продолжены проверки непрерывности визуальной mesh-поверхности на всех профилях качества.'
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
