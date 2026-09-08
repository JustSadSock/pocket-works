/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'pelagos-';
const CACHE_NAME = 'pelagos-v1.6.2';
const APP_VERSION = '1.6.2';
const RELEASE_DATE = '2026-09-09';
const RELEASE_NOTES = [
  'Верфь получила свободный живой осмотр свайпом и более компактный нижний док.',
  'Камера и вода учитывают фактическую длину и ширину выбранного корпуса.',
  'Длиннокорпусная гидродинамика стала единственным владельцем heave/pitch/roll, устраняя остаточную лёгкость от двух конкурирующих solver-ов.',
  'Паруса получили стабильные UV, нейтральную тканевую карту и двухстороннее освещение — цвета верфи читаются корректно и Safari/WebKit не затемняет ткань в чёрный.',
  'Отделки верфи теперь физически различаются шероховатостью корпуса, палубы и парусной ткани, а не только цветом.'
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
