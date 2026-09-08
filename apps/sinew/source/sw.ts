/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'sinew-';
const CACHE_NAME = 'sinew-v1.7.0';
const APP_VERSION = '1.7.0';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Противник переведён на тот же ConstraintArm solver, что и игрок: контакт теперь физически уступает с обеих сторон.',
  'После блока и клинча AI сохраняет короткую память барьера, поэтому оружие не пытается мгновенно продавить ту же поверхность обратно.',
  'Финты больше не телепортируют меч к конечной позе удара: recovery начинается из реально достигнутой позиции замаха.',
  'Blender-меч, гарда, рукоять, навершие и полный щит теперь используются в runtime и синхронизированы с collision-якорями.',
  'Blender Asset Forge повторно сгенерировал combat kit с сужающимся клинком, ламеллярными рёбрами, латунными заклёпками и более детализированным щитом.',
  'Визуальный край Blender-щита связан с физическим радиусом, поэтому графика и контактная геометрия совпадают.',
  'Добавлен симметричный двухсторонний stress-test на тысячи шагов и повторных контактов.'
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
