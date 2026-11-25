/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'petlya-17-';
const CACHE_NAME = 'petlya-17-v3.2.1';
const APP_VERSION = '3.2.1';
const RELEASE_DATE = '2026-10-13';
const RELEASE_NOTES = ["Исправлена критическая ошибка запуска VertexData is not defined: восстановлен импорт Babylon.js для генерации кузовов.","Проверка TypeScript теперь обязательна перед сборкой, чтобы незаявленные идентификаторы не попадали в релиз.","Прибрежный автодром полностью пересобран: асфальт, разметка, поребрики, барьеры, пейзаж и портовые сооружения.","Созданы новые 3D-болиды и кокпит, освобождающий обзор дороги."];

setCacheNameDetails({
  prefix: 'petlya-17',
  suffix: `v${APP_VERSION}`,
  precache: 'precache',
  runtime: 'runtime'
});

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') {
    event.ports?.[0]?.postMessage({
      version: APP_VERSION,
      releaseDate: RELEASE_DATE,
      releaseNotes: RELEASE_NOTES
    });
  }
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && !key.includes(`v${APP_VERSION}`) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => clientsClaim())
  );
});
