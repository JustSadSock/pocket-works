// Offline art-index shell. Update activation is controlled by update-manager,
// never by a fresh installation while visitors are reviewing paintings.
const APP_VERSION='1.2.1';
const RELEASE_DATE='2026-10-16';
const RELEASE_NOTES=["В архиве одобренных картин «Конь Уистлджакет» теперь показан по прямой репродукции Национальной галереи без рамки.","Ревизия 72 подлинников исходной «Замазки» (игровые ID 0–71) — выбор именно для удаления, без автоматического удаления из игры.","28 картин второго выпуска зафиксированы вместе с 36 из первого в двух отдельных архивных разделах.","Используются точные источники Commons из игрового каталога; ошибка миниатюры не подменяет картину другой.","Сохранение, копирование и экспорт игрового списка ID на удаление; нативная мобильная прокрутка и крупный просмотр."];
const CACHE_NAME='art-cabinet-v1.2.1';
const CACHE_PREFIX='art-cabinet-';
const CACHE_PROTOCOL=2;
const FILES=[
 './','./index.html','./styles.css','./app.js','./catalog.js','./new-catalog.js',
 './approved.js','./original-review.js','./second-approved.js',
 './app.config.json','./manifest.webmanifest','./icons/icon.svg',
 '../../shared/mobile-runtime.css','../../shared/mobile-runtime.js',
 '../../shared/update-manager.css','./../../shared/update-manager.js',
 '../../shared/workshop-mode.css','../../shared/workshop-mode.js',
 '../../shared/capabilities/motion.js','../../shared/capabilities/storage.js',
 '../../shared/capabilities/transfer.js','../../shared/capabilities/audio.js',
 '../../shared/capabilities/device.js','../../shared/capabilities/diagnostics.js'
];
const SCOPE=new URL('./',self.registration.scope);
const MAP=new Map(FILES.map(name=>{const u=new URL(name,SCOPE);return [u.pathname,u.href]}));
function freshUrl(input){const u=new URL(input instanceof Request?input.url:input,SCOPE);u.searchParams.set('__pw_build',APP_VERSION+'-p'+CACHE_PROTOCOL);return u;}
async function fetchFresh(input){const response=await fetch(freshUrl(input),{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw Error('Offline resource not available: '+response.status);return response;}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE_NAME);
 await Promise.all([...new Set(MAP.values())].map(async url=>cache.put(url,await fetchFresh(url))));
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 await Promise.all((await caches.keys()).filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key)));
 await self.clients.claim();
})()));
self.addEventListener('message',event=>{
 if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME});
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET')return;
 const url=new URL(req.url);
 // Wikimedia images, custom image sources and other third-party requests must
 // never be rewritten or substituted with HTML on network failure.
 if(url.origin!==self.location.origin||url.pathname.startsWith('/pocketnet/')||url.pathname.startsWith('/pocket-id/'))return;
 const nav=req.mode==='navigate';
 const scoped=url.pathname.startsWith(SCOPE.pathname);
 if(!nav&&!MAP.has(url.pathname)&&!scoped)return;
 const canonical=nav?SCOPE.href:(MAP.get(url.pathname)||url.href);
 event.respondWith((async()=>{
  try{const response=await fetchFresh(req);const cache=await caches.open(CACHE_NAME);await cache.put(canonical,response.clone());return response;}
  catch{return await caches.match(canonical)||(nav?await caches.match(SCOPE.href):undefined)||Response.error();}
 })());
});
