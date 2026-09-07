/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'sinew-';
const CACHE_NAME = 'sinew-v1.0.2';
const APP_VERSION = '1.0.2';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Щит получил настоящие контактные ограничения: он упирается в тело противника, другой щит и собственное тело вместо прохождения насквозь.',
  'Для первого лица введена camera-safe зона: собственный щит больше не может закрывать центр поля зрения и прижиматься к голове.',
  'У оружия появился отдельный момент движения: начало замаха ощущается как сопротивление массы, а остановка пальца даёт короткое физическое продолжение движения.',
  'Стойка стала жёстче: сильнее сцепление с землёй, быстрее гаснут случайные колебания, но активные удары сохраняют инерцию.',
  'Контакт щитом теперь передаёт импульс руке, устойчивости и телам бойцов и даёт звуковую/камерную обратную связь.'
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
