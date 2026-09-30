const CACHE_PREFIX='morok-';
const CACHE_NAME='morok-v3.0.0';
const APP_VERSION='3.0.0';
const RELEASE_DATE='2026-09-30';
const RELEASE_NOTES=["Читаемое поле на всю ширину телефона, тёмные карточные пластины и прямое перетаскивание с проверкой целей.", "Единая очередь для атак, ритуалов, жертв и предметов: физический контакт, осколки, отдача и звук.", "Девять боёв с подготовкой между ними; восстановление победного боя после перезагрузки и исправления Приора, Эха и сброса карт."];
const APP_SHELL=['./','./index.html','./app.config.json','./styles.css','./game-core.js','./app.js','./manifest.webmanifest','./icons/icon.svg','../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/update-manager.css','../../shared/update-manager.js','../../shared/release-guard.js'];
const absolute=path=>new URL(path,self.registration.scope).href;
const shellUrls=new Set(APP_SHELL.map(absolute));
const indexUrl=absolute('./index.html');
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll([...shellUrls]))));
self.addEventListener('message',event=>{
  if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES});
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  const canonical=url.origin+url.pathname;
  if(request.mode!=='navigate'&&!shellUrls.has(canonical)&&!canonical.startsWith(self.registration.scope))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME);
    if(request.mode==='navigate'){
      try{const response=await fetch(request);if(response.ok)await cache.put(indexUrl,response.clone());return response}
      catch{return await cache.match(indexUrl)||new Response('МОРОК: первый запуск требует подключения.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})}
    }
    const cached=await cache.match(request)||await cache.match(canonical);
    if(cached)return cached;
    const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;
  })());
});
