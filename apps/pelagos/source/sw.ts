/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'pelagos-';
const CACHE_NAME = 'pelagos-v1.4.1';
const APP_VERSION = '1.4.1';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Исправлена физическая конвенция руля: перекладка вправо теперь действительно разворачивает судно вправо, а не создаёт противоположный момент.',
  'Убрано второе скрытое сглаживание угловой скорости, которое почти полностью гасило развитие поворота поверх уже существующей инерции корпуса и руля.',
  'Исправлена конвенция apparent wind для парусной поляры: встречный поток снова является no-go зоной, попутный — рабочим курсом, а индикатор оптимального трима соответствует физике.',
  'Гребля сведена к одному contact-gated источнику тяги и одному владельцу анимации восьми вёсел, без двойного импульса и конкурирующих поз.'
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