/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'pelagos-';
const CACHE_NAME = 'pelagos-v1.6.6';
const APP_VERSION = '1.6.6';
const RELEASE_DATE = '2026-09-09';
const RELEASE_NOTES = [
  'Вёсла при удержании ГРЕСТИ выходят из реальных уключин, читаемо проходят силовой гребок и поднимают лопасть на возврате; камера удерживает весь банк в кадре.',
  'Волновой спектр замедлен до масштаба судна, при этом видимая и физическая поверхность используют одну синхронную волну.',
  'Число Фруда связывает скорость с длиной корпуса: волновое сопротивление, динамическая осадка, носовая волна, удар об гребень и кильватер теперь меняются и со скоростью, и с выбранным корпусом.',
  'Физическая кастомизация корпуса, парусов и вёсел и живой профиль верфи сохранены.'
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
