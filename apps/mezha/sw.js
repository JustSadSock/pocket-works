const CACHE_PREFIX='mezha-';
const CACHE_NAME='mezha-v1.2.0';
const APP_VERSION='1.2.0',RELEASE_DATE='2026-10-15',CACHE_PROTOCOL=2;
const RELEASE_NOTES=['Поле боя расширено до 1440×930: путь войск стал длиннее.','Все слои игры рисуются в единой пиксельной сетке без сглаживания.','Перенос сохранений и проверка 64 сценариев.'];
const FILES=['./','./index.html','./app.js','./engine.js','./render.js','./styles.css','./app.config.json','./manifest.webmanifest','./icons/icon.svg','../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/pwa-utils.js','../../shared/update-manager.css','../../shared/update-manager.js'];
const scope=new URL('./',self.registration.scope),build=APP_VERSION+'-p'+CACHE_PROTOCOL;
const paths=new Map(FILES.map(f=>{const url=new URL(f,scope);return[url.pathname,url.href]}));
async function fresh(url){const link=new URL(url);link.searchParams.set('__pw_build',build);const r=await fetch(link,{cache:'no-store'});if(!r.ok)throw Error('Cache preload '+r.status);return r}
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE_NAME).then(async c=>{for(const u of [...new Set(paths.values())])await c.put(u,await fresh(u))})));
self.addEventListener('message',e=>{if(e.data?.type==='GET_UPDATE_INFO')e.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME});if(e.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==self.location.origin)return;const canonical=e.request.mode==='navigate'?scope.href:paths.get(u.pathname);if(!canonical)return;e.respondWith(fresh(e.request.url).then(async r=>{const c=await caches.open(CACHE_NAME);await c.put(canonical,r.clone());return r}).catch(()=>caches.match(canonical).then(v=>v||Response.error())))});
