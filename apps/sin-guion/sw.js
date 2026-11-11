const CACHE_NAME='sin-guion-v1.0.0',CACHE_PREFIX='sin-guion-',APP_VERSION='1.0.0',
 RELEASE_DATE='2026-11-08',CACHE_PROTOCOL=2;
const RELEASE_NOTES=[
  "Шесть разделов грамматики с 60 заданиями и мгновенной проверкой.",
  "Семь тем устного модуля, запись ответов и честная самопроверка.",
  "Карточки речевых шаблонов, локальное интервальное повторение и трёхвопросный пробный экзамен."
];
const ROOT=new URL('./',self.registration.scope);
const PATHS=['./','./index.html','./app.config.json','./styles.css','./app.js','./engine.js','./content.js',
 './manifest.webmanifest','./icons/icon.svg',
 '../../shared/mobile-runtime.css','../../shared/mobile-runtime.js',
 '../../shared/update-manager.css','../../shared/update-manager.js',
 '../../shared/workshop-mode.css','../../shared/workshop-mode.js',
 '../../shared/capabilities/motion.js','../../shared/capabilities/storage.js',
 '../../shared/capabilities/transfer.js','../../shared/capabilities/audio.js',
 '../../shared/capabilities/device.js','../../shared/capabilities/diagnostics.js'];
const LOOKUP=new Map(PATHS.map(path=>{const url=new URL(path,ROOT);return [url.pathname,url.href]}));
function freshUrl(request){const url=new URL(request instanceof Request?request.url:request,ROOT);url.searchParams.set('__pw_build',APP_VERSION+'-p'+CACHE_PROTOCOL);return url;}
async function fresh(request){const response=await fetch(freshUrl(request),{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw Error('HTTP '+response.status);return response;}
async function networkFirst(request,key){try{const response=await fresh(request);const cache=await caches.open(CACHE_NAME);cache.put(key,response.clone()).catch(()=>{});return response;}
 catch{return await caches.match(key)||new Response('Офлайн-кэш недоступен.',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});}}
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE_NAME);await Promise.all([...new Set(LOOKUP.values())].map(async url=>cache.put(url,await fresh(url))))})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{await Promise.all((await caches.keys()).filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key)));await self.clients.claim()})()));
self.addEventListener('message',event=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME});if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
 if(event.request.mode==='navigate'){event.respondWith(networkFirst(event.request,ROOT.href));return;}
 const key=LOOKUP.get(url.pathname);if(key)event.respondWith(networkFirst(event.request,key));
});
