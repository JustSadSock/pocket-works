const RELEASE_NOTES = ["Полный visual rebuild: живой псевдо-3D тоннель, меняющиеся цветовые зоны и глубокий параллакс.","Новая подача персонажа, разломов и искр, скоростные штрихи, шлейфы, вспышки и burst-шокволна.","Добавлен near-miss: опасный пролёт у края ускоряет заряд и визуально отвечает на риск."];
const RELEASE_DATE = "2026-10-01";
const APP_VERSION = "1.1.0";
const CACHE_PREFIX='inkfall-';
const CACHE_NAME='inkfall-v1.1.0-p2';
const APP_SHELL=["../../shared/update-manager.js","../../shared/update-manager.css","../../shared/pwa-utils.js",
  './','./index.html','./app.config.json','./styles.css','./app.js','./renderer.js','./manifest.webmanifest','./icons/icon.svg',
  '../../shared/mobile-runtime.css','../../shared/mobile-runtime.js'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    if(response&&response.ok){
      const copy=response.clone();
      caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));
    }
    return response;
  }).catch(()=>caches.match('./index.html'))));
});

self.addEventListener('message',event=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:1,cacheName:"inkfall-v1.1.0-p2"});if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
