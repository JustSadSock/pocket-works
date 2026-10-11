const CACHE_PREFIX='doctrina-';
const CACHE_NAME='doctrina-v2.0.0';
const APP_VERSION='2.0.0';
const RELEASE_DATE='2026-10-11';
const RELEASE_NOTES=[
  "Полностью новый тактильный государственный атлас с семью интерактивными землями.",
  "Пять сословий, шесть законов, пять указов, дипломатия и пограничные набеги.",
  "Три стартовых формы власти, прошения совета, 24-сезонная кампания и причинная летопись.",
  "Отдельный формат сохранения v2, локальный звук, offline cache и полноценное завершение кампании."
];
const ASSETS=[
 './','./index.html','./app.config.json','./manifest.webmanifest','./styles.css',
 './atlas-v2.js','./core-v2.js','./icons/icon.svg',
 '../../shared/capabilities/motion.js','../../shared/capabilities/storage.js','../../shared/capabilities/transfer.js','../../shared/capabilities/audio.js','../../shared/capabilities/device.js','../../shared/capabilities/diagnostics.js','../../shared/workshop-mode.js','../../shared/workshop-mode.css','../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/pwa-utils.js',
 '../../shared/update-manager.css','../../shared/update-manager.js'
];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)));});
self.addEventListener('message',event=>{
 if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES});
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
 if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).then(response=>{
 if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(c=>c.put('./',copy));}return response;
 }).catch(()=>caches.match('./')));return;}
 event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
 if(response.ok&&response.type!=='opaque'){const copy=response.clone();caches.open(CACHE_NAME).then(c=>c.put(event.request,copy));}return response;
 })));
});