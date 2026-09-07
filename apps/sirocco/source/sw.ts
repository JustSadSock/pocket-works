/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };
const CACHE_PREFIX = 'sirocco-';
const CACHE_NAME = 'sirocco-v1.2.1';
const APP_VERSION = '1.2.1';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Камера вынесена вперёд относительно направления тела, а не направления взгляда, и получила больший near clip: внутренность головы и шеи больше не должна попадать в first-person обзор при поворотах и взгляде вниз.',
  'Персонаж получил раздельные материалы и детали: тёплая кожа, светлая льняная тоба, более тёмные складки, красный кушак и головная повязка, тёмные брюки, кожаная обувь и отдельные видимые кисти.',
  'Убран постоянный тёмный круг вокруг игрока: локальный high-detail sand mesh больше не дублирует всю область рендера и создаётся только в ячейках, где песок действительно был деформирован.',
  'Ходьба по песку стала мягче: снижена жёсткость разгона, добавлены сопротивление грунта и небольшое физическое погружение тела в песок в зависимости от скорости и уклона.'
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
