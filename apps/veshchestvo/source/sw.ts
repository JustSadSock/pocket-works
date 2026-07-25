/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };
const APP_VERSION='1.0.0';
const CACHE_PREFIX='veshchestvo-';
setCacheNameDetails({prefix:'veshchestvo',suffix:`v${APP_VERSION}`,precache:'precache',runtime:'runtime'});
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
self.addEventListener('message',event=>{
  if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:'2026-07-25',releaseNotes:['Физическая лаборатория материалов','Синтез пользовательских веществ','30 экспериментов и задач']});
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&!key.includes(`v${APP_VERSION}`)).map(key=>caches.delete(key)))).then(()=>clientsClaim())));
