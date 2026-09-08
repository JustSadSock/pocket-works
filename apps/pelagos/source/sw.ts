/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'pelagos-';
const CACHE_NAME = 'pelagos-v1.5.0';
const APP_VERSION = '1.5.0';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Blender-катер заново насыщен судовыми деталями: кнехты и швартовное железо, шкивы, нагели, шпигаты, клюзы, компас, колокол, кормовые фонари и более богатая столярка теперь читаются даже с мобильной камеры.',
  'Корабельные фонари физически раскачиваются относительно крена и дифферента, живой огонь мерцает ночью и в шторм, а судовой колокол и его язык получают собственную вторичную инерцию.',
  'Штурвал теперь действительно вращается вместе с перекладкой руля, компасная картушка удерживает север, закреплённые якоря едва играют на волне, а блоки реагируют на нагрузку паруса.',
  'Главный гик получил видимые динамические шкоты: они постоянно перестраиваются между кормовыми блоками и концом гика, поэтому рангоут и такелаж наконец ощущаются одной работающей системой.'
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
