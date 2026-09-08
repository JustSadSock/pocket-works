/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url:string; revision?:string }> };
const APP_VERSION='1.1.0'; const CACHE_PREFIX='aetherwing-';
setCacheNameDetails({prefix:'aetherwing',suffix:`v${APP_VERSION}`,precache:'precache',runtime:'runtime'});
precacheAndRoute(self.__WB_MANIFEST);cleanupOutdatedCaches();registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
self.addEventListener('message',(event)=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:'2026-09-09',releaseNotes:['Additive Blender + aerodynamic dragon posing.','Real-time substep flight physics for slow mobile frames.','Stronger dive energy conversion, persistent sound toggle and recoverable error UX.']});if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',(event)=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&!k.includes(`v${APP_VERSION}`)).map(k=>caches.delete(k)))).then(()=>clientsClaim())));
