/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };
const CACHE_PREFIX = 'bellforge-last-chime-';
const APP_VERSION = '1.1.1';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Новый cache/fingerprint boundary гарантированно отделяет этот билд от 1.1.0 после исправления iOS update-convergence.',
  'Исправлено инвертированное touch-управление камерой и улучшена точность двухручного управления.',
  'Интерфейс полностью адаптирован под горизонтальный iPhone: safe-area, HUD, floating joystick и правый look-sector.',
  'Blender-персонажи, механизмы и мобильный render path получили финальный production pass.'
];
setCacheNameDetails({ prefix: 'bellforge-last-chime', suffix: `v${APP_VERSION}`, precache: 'precache', runtime: 'runtime' });
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') event.ports?.[0]?.postMessage({ version: APP_VERSION, releaseDate: RELEASE_DATE, releaseNotes: RELEASE_NOTES });
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && !key.includes(`v${APP_VERSION}`)).map((key) => caches.delete(key)))).then(() => clientsClaim()));
});
