/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'pelagos-';
const CACHE_NAME = 'pelagos-v1.0.2';
const APP_VERSION = '1.0.2';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Грот и стаксель заменены на физические тканевые поверхности: ветер наполняет их, слабая тяга заставляет провисать и хлопать, а при старте они плавно разворачиваются на рангоуте.',
  'Четыре гигантских весла заменены восемью меньшими судовыми вёслами, которые убираются внутрь корпуса и выходят через борт только во время гребли.',
  'Гребной цикл замедлен и синхронизирован с силой тяги: рабочий ход происходит только при погружённой лопасти, восстановление идёт с флюгированием над водой.',
  'Море получило перекрёстную зыбь и более широкий негармонический спектр волн, поэтому поверхность меньше повторяется, оставаясь общей для рендера и физики корпуса.'
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
