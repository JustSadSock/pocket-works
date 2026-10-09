const CACHE_PREFIX='mechanica-',CACHE_NAME='mechanica-v1.0.0',APP_VERSION='1.0.0',RELEASE_DATE='2026-10-10';
const CACHE_PROTOCOL=3;
const RELEASE_NOTES=['Шесть механических головоломок и свободная сборка шестерён.','Рабочие передачи с расчётом передаточного отношения, завода пружины и направления вращения.','Сохранение схем, звуковые эффекты и офлайн-режим.'];
const FILES=['./','./index.html','./app.config.json','./styles.css','./app.js','./manifest.webmanifest','./icons/icon.svg','../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/update-manager.css','../../shared/update-manager.js'];
const SCOPE=new URL('./',self.registration.scope),BUILD=APP_VERSION+'-p'+CACHE_PROTOCOL;
const KEYS=new Map(FILES.map(file=>{const url=new URL(file,SCOPE);return [url.pathname,url.href];}));
function fresh(input){
  const u=new URL(input instanceof Request?input.url:input,SCOPE);u.searchParams.set('__pw_build',BUILD);
  return fetch(u,{cache:'no-store',credentials:'same-origin',redirect:'follow'}).then(response=>{if(!response.ok)throw new Error('HTTP '+response.status);return response;});
}
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await Promise.all([...new Set(KEYS.values())].map(async url=>cache.put(url,await fresh(url))));
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('message',event=>{
  if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting();
  if(event.data&&event.data.type==='GET_UPDATE_INFO')event.ports&&event.ports[0]&&event.ports[0].postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME});
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const u=new URL(event.request.url);if(u.origin!==self.location.origin)return;
  const canonical=event.request.mode==='navigate'?SCOPE.href:KEYS.get(u.pathname);
  if(!canonical)return;
  event.respondWith((async()=>{
    try{const r=await fresh(event.request);(await caches.open(CACHE_NAME)).put(canonical,r.clone());return r;}
    catch{return (await caches.match(canonical))||(event.request.mode==='navigate'?(await caches.match(SCOPE.href)):undefined)||Response.error();}
  })());
});