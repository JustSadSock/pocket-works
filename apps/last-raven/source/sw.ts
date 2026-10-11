/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };
const CACHE_PREFIX = 'last-raven-';
const CACHE_NAME = 'last-raven-v0.2.0';
const APP_VERSION = '0.2.0';
const RELEASE_DATE = '2026-10-11';
const RELEASE_NOTES = [
  '38 уникальных посетителей и писем, ветвящиеся последствия и сюжетные продолжения.',
  'Три тактических приказа во время осады, зимние крыши, лес и осадный таран.'
];
setCacheNameDetails({ prefix: 'last-raven', suffix: `v${APP_VERSION}`, precache: 'precache', runtime: 'runtime' });
precacheAndRoute(self.__WB_MANIFEST);cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
self.addEventListener('message',(event)=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES});if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('activate',(event)=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&!key.includes(`v${APP_VERSION}`)&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>clientsClaim()))});