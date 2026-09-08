/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'pelagos-';
const CACHE_NAME = 'pelagos-v1.4.0';
const APP_VERSION = '1.4.0';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Парус теперь сразу готов к работе при выходе в море: первые секунды одинаково читаются в Safari/WebKit и Chromium без вида полусвёрнутой ткани.',
  'Камера заново скомпонована вокруг паруса и горизонта: корабль меньше перекрывает портретный экран, поворот даёт мягкий упреждающий взгляд, а вертикальная качка остаётся отфильтрованной.',
  'Blender-корпус получил жилую палубу с банками кокпита, решёткой, компасным постом, швартовым железом, рымами, бухтами троса и ящиком; мобильные материалы лучше читают дерево, латунь и канат.',
  'На парусе появились физические telltales и вымпел: они реагируют на apparent wind, порывы и эффективность настройки и превращают ветер из числа в заметную часть управления.'
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