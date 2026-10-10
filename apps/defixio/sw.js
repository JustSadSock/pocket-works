const CACHE_PREFIX = 'defixio-';
const CACHE_NAME = 'defixio-v1.0.0';
const VERSION='1.0.0',DATE='2026-10-10',PROTOCOL=2;
const NOTES=['Первый выпуск: двенадцать латинских формул и свободная мастерская.','Новая интерактивная свинцовая табличка с царапинами, гравировкой и архивом.'];
const ENTRIES=['./','./index.html','./styles.css','./app.js','./app.config.json','./manifest.webmanifest','./icons/icon.svg',
'../../shared/mobile-runtime.css','../../shared/mobile-runtime.js',
'../../shared/pwa-utils.js','../../shared/update-manager.css','../../shared/update-manager.js',
'../../shared/workshop-mode.css','../../shared/workshop-mode.js',
'../../shared/capabilities/motion.js','../../shared/capabilities/storage.js',
'../../shared/capabilities/transfer.js','../../shared/capabilities/audio.js',
'../../shared/capabilities/device.js','../../shared/capabilities/diagnostics.js'];
const scope=new URL('./',self.registration.scope);
const urls=new Map(ENTRIES.map(entry=>{const u=new URL(entry,scope);return [u.pathname,u.href]}));
const token=VERSION+'-p'+PROTOCOL;
function freshUrl(input){const u=new URL(input instanceof Request?input.url:input,scope);u.searchParams.set('__pw_build',token);return u}
async function fresh(input){const r=await fetch(freshUrl(input),{cache:'no-store',credentials:'same-origin',redirect:'follow'});if(!r.ok)throw Error('HTTP '+r.status);return r}
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE_NAME);await Promise.all([...new Set(urls.values())].map(async u=>{const r=await fresh(u);await cache.put(u,r)}))})())});
self.addEventListener('message',event=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:VERSION,releaseDate:DATE,releaseNotes:NOTES,cacheProtocol:PROTOCOL,cacheName:CACHE_NAME});if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const u=new URL(event.request.url);if(u.origin!==self.location.origin)return;
const key=event.request.mode==='navigate'?scope.href:urls.get(u.pathname);if(!key)return;
event.respondWith((async()=>{try{const r=await fresh(event.request);const cache=await caches.open(CACHE_NAME);await cache.put(key,r.clone());return r}catch{return await caches.match(key)||await caches.match(scope.href)||Response.error()}})())});
