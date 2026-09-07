/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };
const CACHE_PREFIX = 'sirocco-';
const CACHE_NAME = 'sirocco-v1.3.0';
const APP_VERSION = '1.3.0';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Локальный high-detail песок теперь физически заменяет coarse terrain под игроком вместо наложения поверх него: отрицательная часть отпечатка больше не скрывается базовой поверхностью, а на High сетка имеет шаг около 11 см.',
  'Добавлена локальная релаксация песка по углу естественного откоса: выдавленные валики и осыпавшийся материал продолжают понемногу переноситься вниз по склону после шага.',
  'Убран ложный эффект гигантской тени по радиусу рендера: near/far terrain используют одинаковую PBR-реакцию без разных vertex tint, а realtime shadow map больше не применяется к поверхности пустыни; вместо неё добавлена компактная стабильная контактная тень персонажа.',
  'First-person камера вынесена дальше вперёд по фактическому направлению взгляда и получила больший near clip, чтобы голова и шея импортированной модели не могли снова попадать в обзор при рассинхроне взгляда и корпуса.'
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
