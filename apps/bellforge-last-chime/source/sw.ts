/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };
const CACHE_PREFIX = 'bellforge-last-chime-';
const APP_VERSION = '1.0.0';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Полная сюжетная кампания Беллфорджа от городских ворот до Великого Колокола.',
  'Blender Asset Forge генерирует цветную архитектуру, механизмы, пропсы и ригнутых персонажей.',
  'Touch-first управление, резонансные головоломки, rooftop chase, collision proxies и procedural spatial-like audio.'
];
setCacheNameDetails({ prefix: 'bellforge-last-chime', suffix: `v${APP_VERSION}`, precache: 'precache', runtime: 'runtime' });
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') event.ports?.[0]?.postMessage({ version: APP_VERSION, releaseDate: RELEASE_DATE, releaseNotes: RELEASE_NOTES });
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && !key.includes(`v${APP_VERSION}`)).map((key) => caches.delete(key)))).then(() => clientsClaim()));
});
