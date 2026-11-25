const RELEASE_NOTES = ["Полная семидневная кампания с тремя конкурирующими сторонами и финалом, зависящим от доставок.","Физический полёт бумажного самолётика с ветром, восходящими потоками, дождём, деформацией и столкновениями.","Мастерская с реальным влиянием размаха крыльев, балласта, изгиба и покрытия бумаги на поведение самолёта.","Офлайн-режим, локальное сохранение кампании, сенсорное управление, клавиатура, звук и виброотклик."];
const RELEASE_DATE = "2026-07-18";
const APP_VERSION = "1.0.0";
const CACHE_NAME = 'linii-vetra-v1.0.0';
const ASSETS = ["../../shared/update-manager.js","../../shared/update-manager.css","../../shared/pwa-utils.js",'./','./index.html','./styles.css','./game-core.js','./app.js','./manifest.webmanifest','./icons/icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('linii-vetra-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match('./index.html'))));
});

self.addEventListener('message',event=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:1,cacheName:"linii-vetra-v1.0.0"});if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
