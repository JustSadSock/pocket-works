/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'melt-crypt-';
const CACHE_NAME = 'melt-crypt-v1.0.0';
const APP_VERSION = '1.0.0';
const RELEASE_DATE = '2026-09-25';
const RELEASE_NOTES = [
  "Добавлен законченный first-person roguelike-цикл: процедурные этажи, бой, зачистка комнат, выход на следующий уровень, смерть и новая попытка.",
  "Каждый монстр получает процедурный геном внешности и поведения: архетип тела, палитру, рога, глаза, конечности, ауру, скорость, здоровье, размер и одну из нескольких способностей.",
  "Добавлены психоделический пиксельный рендер, кислотное освещение, кристаллы, динамический туман, экранные эффекты от зелий и визуальные реакции на урон.",
  "Добавлены реликвии, зелья, странные находки, сундуки, кодекс открытий, сохранение прогресса и полноценное мобильное/десктопное управление."
];

setCacheNameDetails({ prefix: 'melt-crypt', suffix: `v${APP_VERSION}`, precache: 'precache', runtime: 'runtime' });
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
          .filter((key) => key.startsWith(CACHE_PREFIX) && !key.includes(`v${APP_VERSION}`) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => clientsClaim())
  );
});
