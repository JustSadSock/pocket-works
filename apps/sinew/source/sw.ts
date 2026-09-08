/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'sinew-';
const CACHE_NAME = 'sinew-v1.3.0';
const APP_VERSION = '1.3.0';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Полностью убрана анимационная классификация ударов: быстрый жест теперь прикладывает импульс к физической цепи плечо–локоть–кисть–меч, а траектория рождается из ограничений и инерции.',
  'Обе руки игрока переведены на position-based constraint модель с фиксированной длиной сегментов; блок, промах и столкновение больше не обязаны завершаться одной заранее заданной recovery-анимацией.',
  'Один правый жест разделён на два канала: медленный drag почти полностью управляет камерой, а быстрый flick отдаёт большую часть дополнительной энергии руке, не разворачивая взгляд на пол-экрана.',
  'Щит получил собственную тяжёлую constraint-цепь и реагирует на угрозу независимо от меча; контактные импульсы теперь напрямую толкают физические цепи оружия и щита.',
  'Добавлен новый headless constraint-sparring stress test: проверяются фиксированные длины руки/оружия, разнообразие траекторий, скорость и 120 секунд синтетического боя без накопления растяжения или численного дрейфа.',
  'Старый active-combat/muscle-motion слой больше не подключается к runtime: положение рук имеет один физический источник истины вместо нескольких конкурирующих сглаживателей.'
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
