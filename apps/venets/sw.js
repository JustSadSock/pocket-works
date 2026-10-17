const PREFIX='venets-',CACHE='venets-v0.2.0';
const FILES=['./','./index.html','./app.config.json','./styles.css','./app.js','./manifest.webmanifest','./icons/icon.svg','./dossier.json','./sim/world.js','./sim/random.js','./sim/transactions.js','./sim/validate.js','../../shared/mobile-runtime.js','../../shared/mobile-runtime.css','../../shared/update-manager.js'];
const URLS=new Set(FILES.map(f=>new URL(f,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll([...URLS]);await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith(PREFIX)&&name!==CACHE)await caches.delete(name);await self.clients.claim()})()));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:'0.2.0',appVersion:'0.2.0',releaseDate:'2026-10-17',releaseNotes:['Детерминированный мир из 12 провинций и 17 титулов.','Годовой экономический цикл с журналом транзакций.','Симуляционные стресс-тесты без игрового интерфейса.'],cacheProtocol:1,cacheName:CACHE})});
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.origin!==self.location.origin)return;
 if(req.mode==='navigate'){if(!url.pathname.startsWith(new URL('./',self.registration.scope).pathname))return;event.respondWith((async()=>{try{const response=await fetch(req);if(response.ok)(await caches.open(CACHE)).put(new URL('./',self.registration.scope).href,response.clone());return response}catch{return (await caches.match(new URL('./',self.registration.scope).href))||Response.error()}})());return}
 const key=new URL(url.pathname,url.origin).href;if(!URLS.has(key))return;
 event.respondWith((async()=>{try{const response=await fetch(req);if(response.ok)(await caches.open(CACHE)).put(key,response.clone());return response}catch{return(await caches.match(key))||Response.error()}})());
});
