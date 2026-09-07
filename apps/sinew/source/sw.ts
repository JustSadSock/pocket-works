/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'sinew-';
const CACHE_NAME = 'sinew-v1.1.0';
const APP_VERSION = '1.1.0';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Бой переведён на active-body модель: быстрый жест теперь проходит через load, strike, follow-through и recovery вместо простого следования оружия за камерой.',
  'Направление жеста естественно формирует горизонтальные, диагональные, верхние и восходящие удары с полноценной 3D-траекторией кисти и клинка.',
  'Лезвие получило edge roll, короткий шаг центра массы в удар и наказуемое восстановление после промаха или жёсткого блока.',
  'Щит управляется отдельно от меча: держится относительно корпуса и автоматически смещается к реальной угрозе от клинка противника, не копируя плоскость камеры.',
  'Мечи могут входить в краткий физический bind при медленном контакте; давление влияет на устойчивость обоих бойцов.',
  'Сильные попадания, блоки и clashes получили короткий hit-stop, а AI расширен backhand/rising ударами, более резкими замахами, шагом в атаку и recovery.'
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
