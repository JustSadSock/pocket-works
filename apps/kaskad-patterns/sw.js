const PREFIX='kaskad-patterns-';
const CACHE='kaskad-patterns-v1.0.0';
const VERSION='1.0.0',RELEASE='2026-11-20';
const CORE=['./','./index.html','./styles.css','./app.js','./engine.js','./renderer.js','./exporters.js','./manifest.webmanifest','./app.config.json','./sw.js','./icons/icon.svg','./icons/source.svg','./visual-direction.json','./art-bible.json','../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/update-manager.js','../../shared/update-manager.css'];
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
    event.ports?.[0]?.postMessage({version:VERSION,releaseDate:RELEASE,releaseNotes:['Три модели эмерджентности, раздвоение миров, архив и экспорт.'],cacheProtocol:2,cacheName:CACHE});
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
