/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };
const CACHE_PREFIX='komnatka-';
const APP_VERSION="1.2.0";
const CACHE_NAME="komnatka-v1.2.0";
const RELEASE_DATE="2026-10-15";
const RELEASE_NOTES=["Пять самостоятельных назначений комнат с сохранениями и рекомендованным каталогом: гостиная, спальня, кухня, детская, кабинет.","16 новых настоящих моделей мебели и декора — всего 46, материалы от льна и бархата до дерева, керамики и металла.","Новые фактурные обои и покрытия: штукатурка, панели, лен, паркет ёлочкой и терраццо.","PocketNet v3: пространственные задачи жильцов, три уровня сложности и точный разбор игры по памяти.","Сравнение комнаты до и после с интерактивной границей, старые комнаты и правила v1/v2 сохранены."];
setCacheNameDetails({prefix:'komnatka',suffix:`v${APP_VERSION}`,precache:'precache',runtime:'runtime'});
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
