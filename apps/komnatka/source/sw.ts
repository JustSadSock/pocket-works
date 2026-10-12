/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };
const CACHE_PREFIX='komnatka-';
const APP_VERSION='0.1.0';
const RELEASE_DATE='2026-10-13';
const RELEASE_NOTES=['Первый уютный редактор комнаты: мебель, обои, освещение, сохранение и фотографии.'];
setCacheNameDetails({prefix:'komnatka',suffix:'v'+APP_VERSION,precache:'precache',runtime:'runtime'});
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
self.addEventListener('message',event=>{
 if(event.data?.type==='GET_UPDATE_INFO') event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES});
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(
  keys.filter(k=>k.startsWith(CACHE_PREFIX)&&!k.includes('v'+APP_VERSION)).map(k=>caches.delete(k))
 )).then(()=>clientsClaim()));
});
