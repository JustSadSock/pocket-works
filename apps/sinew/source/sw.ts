/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'sinew-';
const CACHE_NAME = 'sinew-v1.4.0';
const APP_VERSION = '1.4.0';
const RELEASE_DATE = '2026-09-08';
const RELEASE_NOTES = [
  'Полностью переделана нейтральная стойка: меч больше не лежит горизонтально перед противником — кисть находится у нижних рёбер, а остриё угрожает линии лица и груди.',
  'Щит опущен из поля зрения и вынесен влево от центральной линии; круглый щит теперь держится под небольшим углом, а не как вертикальная стена перед глазами.',
  'Противник получил ту же боевую логику стойки: компактный guard, живое дыхание, более естественные замахи, выпады и возврат оружия после удара.',
  'Добавлены микродвижения стойки от дыхания и движения ног без заранее записанного idle-клипа — оружие и руки остаются частью constraint-физики.',
  'Визуальный слой стал цветнее: щиты получили окрашенное поле в цветах бойца, сохранены отдельные дерево, кожа, ткань и металл; добавлены пояс и дополнительные детали экипировки.'
];

setCacheNameDetails({ prefix: 'sinew', suffix: `v${APP_VERSION}`, precache: 'precache', runtime: 'runtime' });
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
self.addEventListener('message',(event)=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES});if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',(event)=>{event.waitUntil(caches.keys().then((keys)=>Promise.all(keys.filter((key)=>key.startsWith(CACHE_PREFIX)&&!key.includes(`v${APP_VERSION}`)&&key!==CACHE_NAME).map((key)=>caches.delete(key)))).then(()=>clientsClaim()));});
