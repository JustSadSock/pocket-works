/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'sinew-';
const CACHE_NAME = 'sinew-v1.6.0';
const APP_VERSION = '1.6.0';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Настоящий Blender Asset Forge на Blender 5.2.1 сгенерировал app-local GLB с цветными PBR-доспехами и экипировкой.',
  'Правый палец теперь задаёт не только скорость жеста, но и устойчивую позицию рук: меч и щит можно удерживать высоко, низко и сбоку без новых кнопок.',
  'Рабочая зона оружия покрывает линию ног и high guard; быстрый flick остаётся физическим импульсом поверх выбранной позиции.',
  'Контакт и замах заметнее передают усилие в кисть, локоть, плечо и корпус, при этом клинок сохраняет жёсткость.',
  'Blender-геометрия использует отдельные материалы стали, кожи, дерева, латуни и цветных элементов, а процедурный риг остаётся fallback.',
  'Добавлен Playwright QA bridge для мобильных Chromium/WebKit прогонов и диагностики боевого состояния.'
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
