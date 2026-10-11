const CACHE_PREFIX='gerbovnik-';
const CACHE_NAME='gerbovnik-v1.0.0';
const APP_VERSION='1.0.0',RELEASE_DATE='2026-10-11',PROTOCOL=2;
const RELEASE_NOTES=[
  "Королевская кампания из 12 наследственных дел, свидетельства, альтернативные решения и различные финалы.",
  "Живой гербовник 10 династий, ручной редактор с проверкой геральдических тинктур и эволюция гербов.",
  "Политическая карта 10 владений, хроника решений, последствия для устойчивости королевства и автосохранение.",
  "Самостоятельная офлайн-игра, адаптированная под управление пальцем."
];
const FILES=['./','./index.html','./app.config.json','./styles.css','./app.js','./data.js','./heraldry.js','./manifest.webmanifest','./icons/icon.svg','../../shared/capabilities/motion.js','../../shared/capabilities/storage.js','../../shared/capabilities/transfer.js','../../shared/capabilities/audio.js','../../shared/capabilities/device.js','../../shared/capabilities/diagnostics.js','../../shared/workshop-mode.js','../../shared/workshop-mode.css','../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/update-manager.css','../../shared/update-manager.js'];
const ROOT=new URL('./',self.registration.scope),token=APP_VERSION+'-p'+PROTOCOL;
const known=new Map(FILES.map(file=>{const url=new URL(file,ROOT);return [url.pathname,url.href]}));
function busted(input){const url=new URL(input instanceof Request?input.url:input,ROOT);url.searchParams.set('__pw_build',token);return url}
async function online(input){const r=await fetch(busted(input),{cache:'no-store',credentials:'same-origin',redirect:'follow'});if(!r.ok)throw Error('HTTP '+r.status);return r}
self.addEventListener('install',e=>e.waitUntil((async()=>{const cache=await caches.open(CACHE_NAME);await Promise.all([...new Set(known.values())].map(async url=>cache.put(url,await online(url))))})()));
self.addEventListener('message',event=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:PROTOCOL,cacheName:CACHE_NAME});if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url);if(u.origin!==self.location.origin)return;
 const canonical=e.request.mode==='navigate'?ROOT.href:known.get(u.pathname);if(!canonical)return;
 e.respondWith((async()=>{try{const r=await online(e.request);const cache=await caches.open(CACHE_NAME);e.waitUntil(cache.put(canonical,r.clone()));return r}catch{return await caches.match(canonical)||Response.error()}})());
});
