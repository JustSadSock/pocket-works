/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'petlya-17-';
const CACHE_NAME = 'petlya-17-v3.0.0';
const APP_VERSION = '3.0.0';
const RELEASE_DATE = '2026-07-14';
const RELEASE_NOTES = [
  'Старый псевдо-3D Canvas-рендер полностью удалён и заменён настоящей Babylon.js-сценой с перспективной камерой внутри кокпита.',
  'Трасса теперь является объёмной замкнутой геометрией с высотами, виражами, кербами, ограждениями, портовыми конструкциями и реальным ближним параллаксом.',
  'Пять соперников получили полноценные 3D-болиды, тени, разные траектории, борьбу за позицию и корректную относительную скорость при обгонах.',
  'Кокпит, руль, halo, зеркала, нос машины, свет, туман, частицы, динамический FOV и процедурный звук работают в одной трёхмерной системе координат.',
  'Приложение переведено на Enhanced runtime с TypeScript, Vite, Workbox, офлайн-сборкой и автоматическим снижением качества при падении FPS.'
];

setCacheNameDetails({
  prefix: 'petlya-17',
  suffix: `v${APP_VERSION}`,
  precache: 'precache',
  runtime: 'runtime'
});

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') {
    event.ports?.[0]?.postMessage({
      version: APP_VERSION,
      releaseDate: RELEASE_DATE,
      releaseNotes: RELEASE_NOTES
    });
  }
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && !key.includes(`v${APP_VERSION}`) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => clientsClaim())
  );
});
