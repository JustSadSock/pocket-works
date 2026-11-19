const PREFIX='kaskad-patterns-';
const CACHE='kaskad-patterns-v1.1.0';
const APP_VERSION='1.1.0';
const VERSION=APP_VERSION,RELEASE='2026-11-20';
const RELEASE_NOTES=["Мастерская законов: создавай собственные клеточные автоматы, выбирай семейство правил, соседство, состояния и граничные условия.","Семь работающих сценариев: Игра жизни, Высшая жизнь, Мозг Брайана, рост кристаллов, циклические хищники, лесной пожар и эпидемия.","Рисование клеток, симметрия, случайное заполнение, точная история/откат, живая статистика, экспорт и импорт JSON.","Сохранены три прежних движка, раздвоение, архив, GIF/PNG и офлайн-режим."];
const CORE=['./','./index.html','./styles.css','./app.js','./engine.js','./studio.js','./renderer.js','./exporters.js','./manifest.webmanifest','./app.config.json','./sw.js','./icons/icon.svg','./icons/source.svg','./visual-direction.json','./art-bible.json','../../shared/workshop-mode.js','../../shared/workshop-mode.css','../../shared/capabilities/motion.js','../../shared/capabilities/storage.js','../../shared/capabilities/transfer.js','../../shared/capabilities/audio.js','../../shared/capabilities/device.js','../../shared/capabilities/diagnostics.js','../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/update-manager.js','../../shared/update-manager.css'];
const SCOPE=new URL('./',self.registration.scope);
const URLS=new Map(CORE.map(p=>{const u=new URL(p,SCOPE);return[u.pathname,u.href];}));
const unique=[...new Set(URLS.values())];
function fresh(request){
  const url=new URL(request instanceof Request?request.url:request,SCOPE);
  url.searchParams.set('__pw_build',VERSION);
  return fetch(url.href,{cache:'no-store',credentials:'same-origin'});
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await Promise.all(unique.map(async url=>{const response=await fresh(url);if(!response.ok)throw Error('Cannot precache '+url);await cache.put(url,response);}));
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('message',event=>{
  if(event.data?.type==='GET_UPDATE_INFO'){
    event.ports?.[0]?.postMessage({version:VERSION,releaseDate:RELEASE,releaseNotes:RELEASE_NOTES,cacheProtocol:2,cacheName:CACHE});
  }
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  const key=event.request.mode==='navigate'?SCOPE.href:URLS.get(url.pathname);
  if(!key)return;
  event.respondWith((async()=>{
    try{
      const response=await fresh(event.request);
      if(!response.ok)throw Error('offline');
      const cache=await caches.open(CACHE);
      await cache.put(key,response.clone());
      return response;
    }catch{return (await caches.match(key))||(await caches.match(SCOPE.href))||Response.error();}
  })());
});
