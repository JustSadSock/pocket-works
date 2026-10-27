const CACHE_PREFIX='ne-tem-golosom-';
const CACHE='ne-tem-golosom-v1.14.3';
const APP_VERSION='1.14.3';
const RELEASE_DATE='2026-10-27';
const RELEASE_NOTES=["На ПК большая двухколоночная звуковая консоль без прокрутки вложенной панели.","Голосовые эффекты переключаются без изменения размеров видео и монтажа.","Проверен полный маршрут от выбора ролика до готовой премьеры."];
const OWN=['./','./index.html','./app.js','./film-cleanup.js','./mp4-audio.js','./film-buzz-worker.js','../tihiy-kadr/mrx-worker.js','../tihiy-kadr/artifact-repair.js','../tihiy-kadr/selective-scnet.js','./clip-mix.js','./room-recovery.js','./media-lab.js','./premiere-export.js','./studio-feedback.js','./recording-audio.js','./media-protocol.js','./trim-range.js','./timeline-model.js','./voice-effects.js','./styles.css','./screen-debug.css','./screen-debug.js','./manifest.webmanifest','./app.config.json','./icons/icon.svg','../../shared/mobile-runtime.js','../../shared/mobile-runtime.css','../../shared/capabilities/net.js','../../shared/capabilities/identity.js'];
const SCOPE=new URL('./',self.registration.scope);
const URLS=new Map(OWN.map(p=>{const u=new URL(p,SCOPE);return [u.pathname,u.href]}));
async function fetchCurrent(url){const u=new URL(url);u.searchParams.set('__pw_build',APP_VERSION);const r=await fetch(u.href,{cache:'no-store',credentials:'same-origin'});if(!r.ok)throw Error('HTTP '+r.status);return r}
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE);await Promise.all([...URLS.values()].map(async url=>{const r=await fetchCurrent(url);await c.put(url,r)}))})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{await Promise.all((await caches.keys()).filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim()})()));
self.addEventListener('message',e=>{if(e.data?.type==='GET_UPDATE_INFO')e.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:2,cacheName:CACHE});if(e.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==self.location.origin)return;const key=e.request.mode==='navigate'?SCOPE.pathname:u.pathname;const url=URLS.get(key);if(!url)return;e.respondWith((async()=>{try{const fresh=await fetchCurrent(url);const c=await caches.open(CACHE);c.put(url,fresh.clone());return fresh}catch{return await caches.match(url)||await caches.match(SCOPE.href)||Response.error()}})())});
