/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };
const CACHE_PREFIX='sinew-';
const CACHE_NAME='sinew-v1.5.0';
const APP_VERSION='1.5.0';
const RELEASE_DATE='2026-09-08';
const RELEASE_NOTES=[
  'Щиты и клинки теперь являются постоянными физическими барьерами: collision решается каждый кадр, а cooldown применяется только к звуку и FX.',
  'Медленное давление мечом больше не проходит сквозь щит: контакт проецирует клинок обратно на поверхность и передаёт давление в кисть, локоть и плечо.',
  'Рабочая зона рук существенно расширена по вертикали: можно опускать меч к ногам, поднимать его в high guard, держать щит у бедра или над головой.',
  'Высота боевой зоны теперь следует за углом взгляда, а быстрый вертикальный flick остаётся ударным импульсом внутри выбранной зоны.',
  'Базовая чувствительность камеры и жестов увеличена примерно в полтора раза; максимальный пользовательский диапазон чувствительности также расширен.',
  'Добавлен stress-test повторных физических контактов: проверяется, что оружие уступает давлению без растяжения костей и численного разлёта.'
];
setCacheNameDetails({prefix:'sinew',suffix:`v${APP_VERSION}`,precache:'precache',runtime:'runtime'});precacheAndRoute(self.__WB_MANIFEST);cleanupOutdatedCaches();registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
self.addEventListener('message',event=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES});if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&!key.includes(`v${APP_VERSION}`)&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>clientsClaim()))});
