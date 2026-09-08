/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'sinew-';
const CACHE_NAME = 'sinew-v1.8.0';
const APP_VERSION = '1.8.0';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'First-person риг получил anatomical envelope: меч и щит больше не могут постоянно перекрывать центральную зону камеры.',
  'Физический щит игрока уменьшен до 78 см, AI — до 82 см; Blender-визуал и collision остаются синхронизированы.',
  'Спокойная стойка меча смещена вправо, но быстрый реальный удар по-прежнему может пересекать центр экрана.',
  'Импульсы меча и щита теперь частично передаются в корпус, чтобы руки не ощущались отдельными плавающими манипуляторами.',
  'Расширен mobile FOV и повышена читаемость Blender-стали и силуэта противника.',
  'QA bridge получил метрики вторжения оружия в центральный first-person corridor для Chromium/WebKit screenshot-проверок.'
];

setCacheNameDetails({ prefix: 'sinew', suffix: `v${APP_VERSION}`, precache: 'precache', runtime: 'runtime' });
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
