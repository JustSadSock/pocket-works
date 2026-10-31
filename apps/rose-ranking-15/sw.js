const CACHE_PREFIX='rose-ranking-15-';const CACHE_NAME='rose-ranking-15-v1.0.0';const APP_VERSION='1.0.0';const RELEASE_DATE='2026-10-31';const CACHE_PROTOCOL=2;
const RELEASE_NOTES=['Тир-листы с отдельным сохранением для каждой серии','23 участницы с настоящими фотографиями','Перетаскивание, прозвища, заметки и резервное копирование'];
const ASSETS=['./','./index.html','./styles.css','./app.js','./model.js','./contestants.js','./manifest.webmanifest','./app.config.json','./icons/icon.svg','../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/update-manager.css','../../shared/update-manager.js','../../shared/workshop-mode.css','../../shared/workshop-mode.js','../../shared/capabilities/storage.js','../../shared/pwa-utils.js','../../shared/capabilities/motion.js','../../shared/capabilities/transfer.js','../../shared/capabilities/diagnostics.js','../../shared/capabilities/audio.js','../../shared/capabilities/device.js'];
const BASE=new URL('./',self.registration.scope);
const paths=new Map(ASSETS.map(path=>{const u=new URL(path,BASE);return [u.pathname,u.href]}));
async function online(url){const u=new URL(url);u.searchParams.set('__pw_build',APP_VERSION+'-p'+CACHE_PROTOCOL);const r=await fetch(u.href,{cache:'no-store'});if(!r.ok)throw Error('Fetch '+r.status);return r;}
self.addEventListener('install',event=>event.waitUntil((async()=>{const c=await caches.open(CACHE_NAME);await Promise.all([...new Set(paths.values())].map(async url=>c.put(url,await online(url))))})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME)await caches.delete(key);await self.clients.claim()})()));
self.addEventListener('message',event=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME});if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const u=new URL(event.request.url);if(u.origin!==self.location.origin){
 if(event.request.destination==='image' && ['viva.ua','imgnewtabl.pravda.com.ua'].includes(u.hostname)){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE_NAME);
   const hit=await cache.match(event.request);
   if(hit)return hit;
   try{
    const response=await fetch(event.request);
    if(response.ok||response.type==='opaque')await cache.put(event.request,response.clone());
    return response;
   }catch{return new Response('',{status:503});}
  })());
 }
 return;
}
const target=event.request.mode==='navigate'?BASE.href:paths.get(u.pathname);if(!target)return;event.respondWith((async()=>{try{const response=await online(target);const cache=await caches.open(CACHE_NAME);await cache.put(target,response.clone());return response}catch{return await caches.match(target)||await caches.match(BASE.href)||new Response('Offline',{status:503})}})())});
