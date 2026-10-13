const VERSION='1.0.0',PREFIX='pw-last-tile-duel-',CACHE=PREFIX+VERSION;
const FILES=['./','./index.html','./app.js','./engine.js','./styles.css','./manifest.webmanifest','./icons/icon.svg',
  '../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/capabilities/net.js'];
const BASE=new URL('./',self.registration.scope);
const MAP=new Map(FILES.map(path=>{const url=new URL(path,BASE);return [url.pathname,url.href]}));
self.addEventListener('install',e=>e.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await Promise.all([...new Set(MAP.values())].map(async url=>{
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw Error('precache: '+url);
  await cache.put(url,response);
 }));
 await self.skipWaiting();
})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{
 const names=await caches.keys();
 await Promise.all(names.filter(n=>n.startsWith(PREFIX)&&n!==CACHE).map(n=>caches.delete(n)));
 await self.clients.claim();
})()));
self.addEventListener('message',e=>{
 if(e.data?.type==='GET_UPDATE_INFO')e.ports?.[0]?.postMessage({
  version:VERSION,releaseDate:'2026-10-13',releaseNotes:['Тактическая дуэль с одним игровым тиком в секунду.'],cacheProtocol:1,cacheName:CACHE
 });
 if(e.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('fetch',e=>{
 const req=e.request;if(req.method!=='GET')return;
 const url=new URL(req.url);
 if(url.origin!==location.origin||url.pathname.startsWith('/pocketnet/')||url.pathname.startsWith('/pocket-id/'))return;
 if(req.mode!=='navigate'&&!MAP.has(url.pathname))return;
 const key=req.mode==='navigate'?BASE.href:MAP.get(url.pathname);
 e.respondWith((async()=>{
  try{
   const response=await fetch(req,{cache:'no-store'});
   if(response.ok)(await caches.open(CACHE)).put(key,response.clone()).catch(()=>{});
   return response;
  }catch{return (await caches.match(key))||Response.error();}
 })());
});
