/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'sinew-';
const CACHE_NAME = 'sinew-v1.2.0';
const APP_VERSION = '1.2.0';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Правая рука переведена с желейного XYZ-following на суставно-мышечную цепь: фиксированные длины плеча/предплечья, угловая инерция, torque limits и жёсткие пределы суставов.',
  'Горизонтальные, диагональные, верхние и восходящие удары теперь строятся forward-kinematics из плеча, локтя и кисти; мягкость находится в суставах, а не в растягивающейся руке.',
  'Торс получает отдельную загрузку и контр-поворот во время load/strike/follow-through, поэтому камера больше не тащит весь верх тела как единый желейный блок.',
  'Добавлен headless muscle-sparring тест: сотни синтетических атак проверяют диапазоны суставов, фиксированную длину руки, разнообразие 3D-траекторий, скорость клинка и возврат в guard.',
  'Силуэт бойцов стал читаемее: появились кисти, ботинки, наплечники, помель меча, ручка щита и дополнительные детали шлема противника.',
  'Щит остаётся отдельным threat-driven контроллером, sword bind/hit-stop/contact physics из 1.1 сохранены поверх новой мышечной модели.'
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
