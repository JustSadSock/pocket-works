/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url:string; revision?:string }> };
const APP_VERSION='1.1.0'; const CACHE_PREFIX='aetherwing-';
setCacheNameDetails({prefix:'aetherwing',suffix:`v${APP_VERSION}`,precache:'precache',runtime:'runtime'});
precacheAndRoute(self.__WB_MANIFEST);cleanupOutdatedCaches();registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
self.addEventListener('message',(event)=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:'2026-09-09',releaseNotes:['Additive Blender animation and aerodynamic posing make the dragon react to load, climb, dive and braking.','Bounded-substep flight physics keeps controls consistent through slow mobile frames and makes dives convert altitude into speed.','Terrain-aware chase camera keeps the dragon framed during low flight instead of climbing over river banks.','Higher-detail terrain, slope rock exposure and rebuilt Blender forest props make the streamed world denser and more natural.','Persistent sound controls and recoverable loading errors complete the mobile release UX.']});if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',(event)=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&!k.includes(`v${APP_VERSION}`)).map(k=>caches.delete(k)))).then(()=>clientsClaim())));
