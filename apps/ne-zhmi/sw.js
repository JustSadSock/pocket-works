const APP_VERSION='0.1.0';
const CACHE_NAME='ne-zhmi-v0.1.0';
const RELEASE_DATE='2026-10-23';
const RELEASE_NOTES=["Первая играбельная локальная трасса: автоматическое движение Болтика, две независимые кнопки, прыжок и разворот.","Контрольная точка, ямы, столкновения, пауза, финиш, результаты и рекорд.","Адаптивный тактильный пульт с клавиатурным и сенсорным управлением."];
const VERSION=APP_VERSION,CACHE=CACHE_NAME,PREFIX='ne-zhmi-';
const FILES=['./','./index.html','./app.config.json','./styles.css','./app.js','./engine.js','./renderer.js','./manifest.webmanifest','./icons/icon.svg','../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/workshop-mode.css','../../shared/workshop-mode.js','../../shared/capabilities/motion.js','../../shared/capabilities/storage.js','../../shared/capabilities/transfer.js','../../shared/capabilities/audio.js','../../shared/capabilities/device.js','../../shared/capabilities/diagnostics.js','../../shared/update-manager.js'];
const ROOT=new URL('./',self.registration.scope);
const ENTRIES=new Map(FILES.map(file=>{const url=new URL(file,ROOT);return[url.pathname,url.href]}));
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await Promise.all([...new Set(ENTRIES.values())].map(async url=>{
  const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error('Cannot cache '+url);
  await cache.put(url,response);
 }));
 })()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)));
 await self.clients.claim();
})()));
self.addEventListener('message',event=>{
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
 if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:2,cacheName:CACHE});
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 if(url.origin!==location.origin)return;
 if(event.request.mode!=='navigate'&&!ENTRIES.has(url.pathname))return;
 const canonical=event.request.mode==='navigate'?ROOT.href:ENTRIES.get(url.pathname);
 event.respondWith((async()=>{
  try{const fresh=await fetch(event.request,{cache:'no-store'});
   if(fresh.ok){const cache=await caches.open(CACHE);await cache.put(canonical,fresh.clone());}
   return fresh;
  }catch{return await caches.match(canonical)||Response.error();}
 })());
});