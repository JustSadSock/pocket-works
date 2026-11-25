const APP_VERSION = '1.0.0';
const RELEASE_DATE = '2026-11-16';
const RELEASE_NOTES = ["Первая версия: физические рикошеты, волны мишеней, очки и комбо.","Жестовый запуск с упругим натяжением и один перехват каждого летящего шарика.","Локальный рекорд, оригинальные звуки, офлайн-PWA и управление с клавиатуры."];
const PREFIX="bzyn-";
const CACHE="bzyn-v1.0.0";
const FILES=["../../shared/capabilities/motion.js","../../shared/capabilities/storage.js","../../shared/capabilities/transfer.js","../../shared/capabilities/audio.js","../../shared/capabilities/device.js","../../shared/capabilities/diagnostics.js","../../shared/workshop-mode.js","../../shared/workshop-mode.css","../../shared/mobile-runtime.js","../../shared/pwa-utils.js","./","./index.html","./app.config.json","./app.js","./physics.mjs","./styles.css","./manifest.webmanifest","./icons/icon.svg","../../shared/mobile-runtime.css","../../shared/update-manager.css","../../shared/update-manager.js"];
const known=new Set(FILES.map(path=>new URL(path,self.registration.scope).pathname));
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener("message",event=>{
  if(event.data?.type==="SKIP_WAITING")self.skipWaiting();
  if(event.data?.type==="GET_UPDATE_INFO")event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheName:CACHE,cacheProtocol:2});
});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  const scope=new URL("./",self.registration.scope);
  if(event.request.mode==="navigate"&&url.pathname.startsWith(scope.pathname)){
    event.respondWith(fetch(event.request).catch(()=>caches.match("./")));return;
  }
  if(!known.has(url.pathname))return;
  event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{
    if(response.ok&&response.type!=="opaque")caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));
    return response;
  })));
});
