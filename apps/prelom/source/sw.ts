/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'prelom-';
const CACHE_NAME = 'prelom-v1.0.0';
const APP_VERSION = '1.0.0';
const RELEASE_DATE = '2026-07-25';
const RELEASE_NOTES = [
  'Добавлен собственный мобильный движок геометрической оптики с отражением, преломлением, дисперсией, полным внутренним отражением, поглощением и частичным отражением.',
  'Реализованы семь режимов визуализации, измерительные инструменты, 12 готовых экспериментов и 15 задач с автоматической проверкой.',
  'Добавлены локальные сохранения, автосохранение, восстановление повреждённых данных, импорт и экспорт JSON, офлайн-режим и обучение поверх стартовой сцены с призмой.',
  'Добавлены жесты мобильного редактирования, динамическое качество, ограничение вычислительной нагрузки, звуки и вибрация с отдельными выключателями.',
  'Добавлены Apache-2.0 attribution и NOTICE для идей и вычислительных подходов Ray Optics Simulation.'
];

setCacheNameDetails({
  prefix: 'prelom',
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
