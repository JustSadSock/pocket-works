/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'sinew-';
const CACHE_NAME = 'sinew-v1.0.1';
const APP_VERSION = '1.0.1';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Управление по вертикали исправлено: движение пальца вверх теперь поднимает взгляд, вниз — опускает.',
  'Физический риг стал значительно устойчивее: убрана водянистая раскачка кистей, меча, щита и корпуса при спокойном управлении.',
  'Резкие движения сохраняют короткую инерцию и сопротивление массы, а отпускание движения быстро возвращает бойца в устойчивую стойку без скольжения.',
  'WebAudio надёжнее разблокируется и восстанавливается в Safari/iOS после interrupted/suspended состояний; боевые и шаговые звуки стали заметнее.'
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
