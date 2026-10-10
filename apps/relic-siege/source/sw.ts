/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = "relic-siege-";
const CACHE_NAME = "relic-siege-v2.0.0";
const APP_VERSION = '2.0.0';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = ["Полностью заменена круглая арена на многоуровневую Blender-крепость с Внешними воротами, Двором, Архивом, Кузней, Солнечным мостом и Верхним святилищем.", "Blender Asset Forge теперь генерирует не только окружение и босса, но и игрового Хранителя и обычного Пепельного рейдера с armature и animation actions.", "Бой перестроен вокруг трёхударного комбо, удерживаемого блока, таймингового парирования и заряжаемой способности RELIC; добавлены raider, brute, seer и boss AI.", "Audio Asset Forge расширен отдельными слоями исследования и боя, парированием, enemy cue, шагами, ударами и финальным стингером.", "Playwright AI QA получает реальные координаты Y, grounded, текущую зону, прогресс двух ключей, collision count, actor asset state, HP, relic charge и число врагов."];

setCacheNameDetails({
  prefix: 'relic-siege',
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
