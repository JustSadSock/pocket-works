/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };
const CACHE_PREFIX = 'sirocco-';
const CACHE_NAME = 'sirocco-v1.2.0';
const APP_VERSION = '1.2.0';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Процедурное тело из примитивов заменено на полноценный CC0 skinned humanoid Quaternius с готовыми walk/idle-анимациями; поверх модели собран выраженный образ бедуинского путника с длинной светлой тобой, кушаком, куфией и рукавами.',
  'Ходьба теперь управляется настоящим скелетным animation clip с плавным idle/walk blending и скоростью шага, привязанной к реальной скорости персонажа; контакт стоп определяется по костям анимированной модели вместо растягивания процедурных ног.',
  'Исправлен большой тёмный круг вокруг игрока: локальный слой физического песка больше не поднят искусственно на пять сантиметров и не принимает отдельную shadow map, поэтому он визуально сливается с основной пустыней.',
  'First-person камера вынесена перед лицом модели и получила более спокойный bob/sway, чтобы тело ощущалось человеческим и не залезало внутрь камеры.'
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
