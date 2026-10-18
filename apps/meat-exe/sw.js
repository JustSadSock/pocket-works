const CACHE_PREFIX='meat-exe-';
const CACHE_NAME='meat-exe-v1.7.0';
const APP_VERSION='1.7.0';
const RELEASE_DATE='2026-10-18';
const RELEASE_NOTES=[
'Развивающийся иммунный ответ с предупреждениями и стражем желудка.',
'Три структурно разных комнаты желудка, рельеф и мышечные складки.',
'Новые силуэты врагов, движущиеся конечности и сохранение реакции организма.'
];
const FILES=['./','./index.html','./app.config.json','./app.js','./scene.js','./organGen.js','./biomes.js','./ecology.js','./biobuilds.js','./immunity.js','./gastricArt.js','./stability.js','./combat.js','./sound-forge.js','./three.module.js','./styles.css','./manifest.webmanifest','./icons/icon.svg','../../shared/mobile-runtime.js','../../shared/mobile-runtime.css'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{
 if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES});
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)return;
 if(event.request.mode==='navigate'){
   event.respondWith(fetch(event.request).then(response=>{if(response.ok)caches.open(CACHE_NAME).then(c=>c.put('./',response.clone()));return response;}).catch(()=>caches.match('./')));
 }else if(url.pathname.includes('/apps/meat-exe/')||url.pathname.includes('/shared/mobile-runtime.')){
   event.respondWith(caches.match(event.request).then(r=>r||fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(c=>c.put(event.request,copy));}return response;})));
 }
});