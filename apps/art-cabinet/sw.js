// PocketWorks managed offline release: activation only after user consent.
const CACHE_PREFIX='art-cabinet-',CACHE='art-cabinet-v1.2.1',APP_VERSION='1.2.1',RELEASE_DATE='2026-10-16';
const RELEASE_NOTES=["В архиве одобренных картин «Конь Уистлджакет» теперь показан по прямой репродукции Национальной галереи без рамки.","Ревизия 72 подлинников исходной «Замазки» (игровые ID 0–71) — выбор именно для удаления, без автоматического удаления из игры.","28 картин второго выпуска зафиксированы вместе с 36 из первого в двух отдельных архивных разделах.","Используются точные источники Commons из игрового каталога; ошибка миниатюры не подменяет картину другой.","Сохранение, копирование и экспорт игрового списка ID на удаление; нативная мобильная прокрутка и крупный просмотр."];
const FILES=["./","./index.html","./styles.css","./app.js","../../shared/mobile-runtime.css","../../shared/mobile-runtime.js","../../shared/update-manager.js","../../shared/update-manager.css","./catalog.js","./new-catalog.js","./approved.js","./original-review.js","./second-approved.js","./app.config.json","./manifest.webmanifest","./icons/icon.svg"];
const SCOPE=new URL('./',self.registration.scope);
const ASSETS=new Map(FILES.map(file=>{const url=new URL(file,SCOPE);return [url.pathname,url.href]}));
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await Promise.all([...new Set(ASSETS.values())].map(async url=>{
  const response=await fetch(new Request(url,{cache:'reload'}));
  if(!response.ok)throw new Error('Unable to precache '+url);
  await cache.put(url,response);
 }));
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key)));
 await self.clients.claim();
})()));
self.addEventListener('message',event=>{
 if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheName:CACHE,cacheProtocol:2});
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)return;
 const canonical=event.request.mode==='navigate'?SCOPE.href:ASSETS.get(url.pathname);
 if(!canonical)return;
 event.respondWith((async()=>{
  try{
   const response=await fetch(event.request);
   if(!response.ok)throw new Error(String(response.status));
   const cache=await caches.open(CACHE);await cache.put(canonical,response.clone());
   return response;
  }catch{return (await caches.match(canonical))||Response.error();}
 })());
});
