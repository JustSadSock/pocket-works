const APP_VERSION='1.0.0';
const RELEASE_DATE='2026-10-13';
const RELEASE_NOTES=["Первый релиз: онлайн-комнаты PocketNet на двух игроков, приглашение по коду и ссылке.","Строго один авторитетный игровой тик в секунду: шаг, прыжок, толчок, разрушение плит и матч до трёх побед.","Локальная тренировка против бота, управление с клавиатуры и телефона, локальные звук и статистика."];
const PREFIX='last-tile-duel-';
const CACHE_NAME='last-tile-duel-v1.0.0';
const VERSION=APP_VERSION;
const FILES=['./','./index.html','./app.js','./engine.js','./styles.css','./manifest.webmanifest','./icons/icon.svg',
  '../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/capabilities/net.js','./../../shared/update-manager.js','../../shared/update-manager.css',
  '../../shared/workshop-mode.js','../../shared/workshop-mode.css',
  '../../shared/capabilities/motion.js','../../shared/capabilities/storage.js','../../shared/capabilities/transfer.js',
  '../../shared/capabilities/audio.js','../../shared/capabilities/device.js','../../shared/capabilities/diagnostics.js'];
const BASE=new URL('./',self.registration.scope);
const MAP=new Map(FILES.map(path=>{const url=new URL(path,BASE);return [url.pathname,url.href]}));
self.addEventListener('install',e=>e.waitUntil((async()=>{
 const cache=await caches.open(CACHE_NAME);
 await Promise.all([...new Set(MAP.values())].map(async url=>{
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw Error('precache: '+url);
  await cache.put(url,response);
 }));
 // A waiting update only activates after the shared update-manager asks for it.
})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{
 const names=await caches.keys();
 await Promise.all(names.filter(n=>n.startsWith(PREFIX)&&n!==CACHE_NAME).map(n=>caches.delete(n)));
 await self.clients.claim();
})()));
self.addEventListener('message',event=>{
 if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({
  version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:2,cacheName:CACHE_NAME
 });
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
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
   if(response.ok)(await caches.open(CACHE_NAME)).put(key,response.clone()).catch(()=>{});
   return response;
  }catch{return (await caches.match(key))||Response.error();}
 })());
});
