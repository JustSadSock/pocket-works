/// <reference lib="webworker" />
import { setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url:string; revision?:string }> };
const APP_VERSION='1.0.0'; const CACHE_PREFIX='corvus-yard-';
setCacheNameDetails({prefix:'corvus-yard',suffix:`v${APP_VERSION}`,precache:'precache',runtime:'runtime'});
precacheAndRoute(self.__WB_MANIFEST);cleanupOutdatedCaches();registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
self.addEventListener('message',(event)=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:'2026-09-30',releaseNotes:['Полёт ворона, осенний канал и взаимодействия с окружением.']});if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',(event)=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&!k.includes(`v${APP_VERSION}`)).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
