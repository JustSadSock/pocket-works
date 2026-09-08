/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'pelagos-';
const CACHE_NAME = 'pelagos-v1.2.0';
const APP_VERSION = '1.2.0';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Камера переведена на единый абсолютный контроллер: устранён накопительный дрейф между старыми camera-pass, горизонт стабилен, а поворот и вертикальная качка фильтруются без улётов.',
  'Главный корпус, палуба, киль, штевни, фальшборты, поручни, кокпит, люки, цепные планки и мелкие палубные детали теперь создаются Blender Asset Forge и загружаются как единый GLB.',
  'Blender-корпус сохраняет существующие физические паруса, вёсла, снасти, ватерлинию, пену и гидродинамику, поэтому качество модели выросло без потери реактивной физики.',
  'Процедурный корпус оставлен как автоматический fallback: если GLB недоступен, путешествие всё равно запускается и остаётся полностью игровым.'
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
