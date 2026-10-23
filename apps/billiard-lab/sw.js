const CACHE_PREFIX = 'billiard-lab-';
const CACHE_NAME = 'billiard-lab-v2.2.0';
const APP_VERSION = '2.2.0';
const RELEASE_DATE = '2026-10-23';
const RELEASE_NOTES = ['Лаборатория теперь с 11 геометриями и редактором полей.','Одна цветная волна без шлейфов, оптимизированная физика и масштабирование.'];
const CACHE_PROTOCOL = 2;
const FILES = ['./','./index.html','./app.config.json','./app.js','./physics.mjs','./styles.css','./manifest.webmanifest','./icons/icon.svg','../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/update-manager.css','../../shared/update-manager.js','../../shared/workshop-mode.css','../../shared/workshop-mode.js','../../shared/capabilities/motion.js','../../shared/capabilities/storage.js','../../shared/capabilities/transfer.js','../../shared/capabilities/audio.js','../../shared/capabilities/device.js','../../shared/capabilities/diagnostics.js'];
const SCOPE = new URL('./',self.registration.scope);
const URLS = new Map(FILES.map(file=>{const url=new URL(file,SCOPE);return [url.pathname,url.href]}));
const bust = request => {const url=new URL(request instanceof Request?request.url:request,SCOPE);url.searchParams.set('__pw_build',APP_VERSION+'-p'+CACHE_PROTOCOL);return url};
async function fresh(input){const response=await fetch(bust(input),{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw Error('Offline');return response}
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE_NAME);await Promise.all([...new Set(URLS.values())].map(async url=>cache.put(url,await fresh(url))))})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key)));await self.clients.claim()})()));
self.addEventListener('message',event=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME});if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;const canonical=event.request.mode==='navigate'?SCOPE.href:URLS.get(url.pathname);if(!canonical)return;event.respondWith((async()=>{try{const response=await fresh(event.request);const cache=await caches.open(CACHE_NAME);await cache.put(canonical,response.clone());return response}catch{const cached=await caches.match(canonical);return cached||Response.error()}})())});
