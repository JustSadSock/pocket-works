/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };
const CACHE_PREFIX = 'sirocco-';
const CACHE_NAME = 'sirocco-v1.7.0';
const APP_VERSION = '1.7.0';
const RELEASE_DATE = '2026-09-09';
const RELEASE_NOTES = [
  'Ветер теперь единый для звука, низких песчаных струй, дымки и вторичного движения одежды.',
  'Свежие рыхлые валики следов понемногу переносятся по ветру, а глубокие впадины постепенно смягчаются наносимым песком.',
  'Добавлен отдельный низкий слой ветрового песка, который появляется только во время заметных порывов.',
  'Presence layer имеет собственный ограниченный erosion budget и не вмешивается в основной terrain/locomotion loop.',
  'Node + Chromium/WebKit QA отдельно проверяет gust-state, перенос рыхлого песка, штиль и mobile landscape rendering.'
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
