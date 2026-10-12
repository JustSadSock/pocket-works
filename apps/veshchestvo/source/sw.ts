/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };
const CACHE_PREFIX='veshchestvo-';
const CACHE_NAME='veshchestvo-v1.0.1';
const APP_VERSION='1.0.1';
const RELEASE_DATE='2026-10-12';
const RELEASE_NOTES=[
  "Исправлено автосохранение: состояние снова сохраняется каждые 15 секунд, при уходе в фон и после открытия или импорта мира.",
  "Исправлены мультитач, pointercancel и скрытые инструменты: pinch больше не засоряет Undo и IndexedDB, а стёртые стены, генераторы и стоки действительно исчезают.",
  "Исправлены задачи, перемотка, импорт датчиков и пользовательские вещества: контекст корректно сбрасывается, импорт не уничтожает личную библиотеку, коллизии ID больше не ломают материалы.",
  "Исправлена физика газов и тестовая камера синтеза; подключены штатные Pocket Works Mobile Runtime, обновления и Workshop Mode."
];
setCacheNameDetails({prefix:'veshchestvo',suffix:`v${APP_VERSION}`,precache:'precache',runtime:'runtime'});
precacheAndRoute(self.__WB_MANIFEST);cleanupOutdatedCaches();registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
self.addEventListener('message',event=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES});if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&!key.includes(`v${APP_VERSION}`)&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>clientsClaim()));});
