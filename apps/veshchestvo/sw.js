const VERSION='1.0.0';
const PREFIX='veshchestvo-';
const CACHE=`${PREFIX}v${VERSION}`;
const FILES=['./','./index.html','./app.js','./styles.css','./manifest.webmanifest','./icons/icon.svg','./LICENSE','./ATTRIBUTION.md','./README.md','./runtime/core.js','./runtime/runtime-01.js','./runtime/runtime-02.js','./runtime/runtime-03.js','./runtime/runtime-04.js','./runtime/runtime-05.js','./runtime/runtime-06.js','./runtime/runtime-07.js','./runtime/runtime-08.js']
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>event.request.mode==='navigate'?caches.match('./index.html'):Response.error())));
});
self.addEventListener('message',event=>{
  if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:VERSION,releaseDate:'2026-07-25',releaseNotes:['Клеточная лаборатория материалов','Визуальный синтез веществ','15 сцен и 15 задач']});
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
