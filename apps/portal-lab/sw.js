const PREFIX='portal-lab-',CACHE='portal-lab-v0.7.0',VERSION='0.7.0',RELEASE='2026-10-19';
const NOTES=['Сравнение вращающейся кротовой норы типа Тео и точного Шварцшильда: геодезические, эргорегион, горизонт'];
const OWN=['./','./index.html','./styles.css','./app.js','./relativity.js','./optics.js','./tidal.js','./observatory.js','./material.js','./material-view.js','./waves.js','./wave-view.js','./spacetime.js','./designer.js','./rotation.js','./rotation-view.js','./audio.js','./manifest.webmanifest','./app.config.json','./icons/icon.svg'];
const SCOPE=new URL('./',self.registration.scope);
const ASSETS=new Map(OWN.map(p=>{const u=new URL(p,SCOPE);return [u.pathname,u.href]}));
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(async c=>{
 await Promise.all([...new Set(ASSETS.values())].map(async url=>{
  const response=await fetch(new Request(url,{cache:'reload'}));
  if(!response.ok)throw Error('Unable to precache '+url);
  await c.put(url,response);
 }));
})));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{if(e.data?.type==='GET_UPDATE_INFO')e.ports?.[0]?.postMessage({version:VERSION,releaseDate:RELEASE,releaseNotes:NOTES,cacheProtocol:2,cacheName:CACHE});if(e.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url);if(u.origin!==self.location.origin)return;
 const canonical= e.request.mode==='navigate'?SCOPE.href:ASSETS.get(u.pathname);if(!canonical)return;
 e.respondWith((async()=>{
  try{
   const response=await fetch(e.request);
   if(!response.ok)throw Error(String(response.status));
   const cache=await caches.open(CACHE);await cache.put(canonical,response.clone());
   return response;
  }catch{const cached=await caches.match(canonical);return cached||Response.error();}
 })());
});
