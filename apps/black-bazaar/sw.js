const APP_VERSION='0.6.0';
const VERSION=APP_VERSION;
const RELEASE_DATE='2026-10-22';
const RELEASE_NOTES = ["Первая завершённая публичная продажа за ход приносит продавцу дополнительную деталь.","Личные квоты и волны срочных заказов нормированы по трудозатратам.","Контрпредложения, покупки у брокера и разбор предметов доступны в механической альфе."];
const NOTES=RELEASE_NOTES;
const CACHE='black-bazaar-v0.6.0';
const CACHE_NAME=CACHE;
const PREFIX='black-bazaar-v';
const FILES=[
 './','./index.html','./app.js','./styles.css','./app.config.json',
 './manifest.webmanifest','./icons/icon.svg',
 '../../shared/mobile-runtime.css','../../shared/mobile-runtime.js',
 '../../shared/update-manager.css','../../shared/update-manager.js',
 '../../shared/capabilities/net.js',
 '../../shared/workshop-mode.js','../../shared/workshop-mode.css',
 '../../shared/capabilities/motion.js','../../shared/capabilities/storage.js','../../shared/capabilities/transfer.js',
 '../../shared/capabilities/audio.js','../../shared/capabilities/device.js','../../shared/capabilities/diagnostics.js'
];
const ROOT=new URL('./',self.registration.scope);
const ENTRIES=new Map(FILES.map(x=>{const url=new URL(x,ROOT);return [url.pathname,url.href];}));
self.addEventListener('install',e=>e.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await Promise.all([...new Set(ENTRIES.values())].map(async url=>{
   const response=await fetch(url,{cache:'no-store'});
   if(!response.ok)throw Error('Precache failed: '+url);
   await cache.put(url,response);
 }));
})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{
 await Promise.all((await caches.keys()).filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)));
 await self.clients.claim();
})()));
self.addEventListener('message',event=>{const e=event;
 if(e.data?.type==='SKIP_WAITING')self.skipWaiting();
 if(e.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({
   version:VERSION,releaseDate:'2026-10-22',releaseNotes:NOTES,
   cacheProtocol:1,cacheName:CACHE
 });
});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const url=new URL(e.request.url);
 if(url.origin!==location.origin||url.pathname.startsWith('/pocketnet/'))return;
 if(e.request.mode!=='navigate'&&!ENTRIES.has(url.pathname))return;
 const fallback=e.request.mode==='navigate'?ROOT.href:ENTRIES.get(url.pathname);
 e.respondWith((async()=>{
   try{
     const response=await fetch(e.request);
     if(response.ok)(await caches.open(CACHE)).put(fallback,response.clone()).catch(()=>{});
     return response;
   }catch{return await caches.match(fallback)||Response.error();}
 })());
});
