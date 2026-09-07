/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };
const CACHE_PREFIX = 'sirocco-';
const CACHE_NAME = 'sirocco-v1.0.2';
const APP_VERSION = '1.0.2';
const RELEASE_DATE = '2026-09-07';
const RELEASE_NOTES = [
  'Перестроена генерация рельефа: вместо одинаковых параллельных рядов появились регионально изгибающиеся гряды, разрывы, седловины и меняющаяся высота дюн.',
  'Повышена плотность ближней геометрии и сглажены высокочастотные формы, чтобы камера больше не проваливалась под визуальную поверхность дюны.',
  'Исправлено инвертированное горизонтальное управление камерой на touch-экране.',
  'Убран торс и таз из first-person рендера: геометрия тела больше не перекрывает нижнюю половину экрана.'
];
setCacheNameDetails({ prefix: 'sirocco', suffix: `v${APP_VERSION}`, precache: 'precache', runtime: 'runtime' });
precacheAndRoute(self.__WB_MANIFEST); cleanupOutdatedCaches(); registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
self.addEventListener('message', (event) => { if (event.data?.type === 'GET_UPDATE_INFO') event.ports?.[0]?.postMessage({ version: APP_VERSION, releaseDate: RELEASE_DATE, releaseNotes: RELEASE_NOTES }); if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && !key.includes(`v${APP_VERSION}`) && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => clientsClaim())); });
