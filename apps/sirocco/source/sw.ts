/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };
const CACHE_PREFIX = 'sirocco-';
const CACHE_NAME = 'sirocco-v1.1.0';
const APP_VERSION = '1.1.0';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Песок переведён с декоративных геометрических следов на локальную физическую world-space heightfield: стопа вдавливает поверхность, выталкивает валик, переносит песок вниз по склону и оставляет устойчивую деформацию, не зависящую от направления камеры.',
  'Добавлена отдельная высокодетализированная физическая sand-surface вокруг игрока, поэтому сантиметровые отпечатки и локальное осыпание видны без увеличения детализации всей бесконечной пустыни.',
  'First-person тело пересобрано в образе бедуинского путника: длинная светлая туника, пояс, свободные штаны, обмотки, кожаная обувь, рукава и руки, а ноги используют устойчивый двухзвенный IK.',
  'Освещение и тени переделаны: удалено полосатое terrain self-shadowing и чрезмерная periodic normal-map рябь, солнце опущено ниже для читаемой формы дюн, а персонаж получает отдельную мягкую фильтрованную динамическую тень.'
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
