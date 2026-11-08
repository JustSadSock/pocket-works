const CACHE_NAME = 'rivals-dna-v1.0.0';
const CACHE_PREFIX = 'rivals-dna-';
const APP_VERSION = '1.0.0';
const RELEASE_DATE = '2026-11-08';
const RELEASE_NOTES = [
  'Новый тактический тест игрового почерка с 54 героями.',
  'Адаптивный топ-10, корректировки после матчей и сравнение дуэтов.',
  'Локальные профили, импорт и экспорт результатов.'
];
const CACHE_PROTOCOL = 2;
const ROOT = new URL('./', self.registration.scope);
const PATHS = [
 './','./index.html','./app.config.json','./styles.css','./app.js','./engine.js',
 './hero-data.js','./questions.js','./manifest.webmanifest','./icons/icon.svg',
 '../../shared/mobile-runtime.css','../../shared/mobile-runtime.js',
 '../../shared/update-manager.css','../../shared/update-manager.js'
];
const LOOKUP = new Map(PATHS.map(path => {const u=new URL(path, ROOT);return [u.pathname,u.href];}));
function versioned(request) {
 const url=new URL(request instanceof Request?request.url:request,ROOT);
 url.searchParams.set('__pw_build', APP_VERSION+'-p'+CACHE_PROTOCOL);
 return url;
}
async function fresh(request) {
 const res=await fetch(versioned(request),{cache:'no-store',credentials:'same-origin'});
 if(!res.ok)throw Error('Network '+res.status);
 return res;
}
async function cacheFresh(request,key) {
 try{const r=await fresh(request);(await caches.open(CACHE_NAME)).put(key,r.clone()).catch(()=>{});return r;}
 catch {return await caches.match(key)||new Response('Нет соединения и кэша приложения.',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});}
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE_NAME);
 await Promise.all([...new Set(LOOKUP.values())].map(async u=>{const response=await fresh(u);await cache.put(u,response);}));
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 await Promise.all((await caches.keys()).filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)));
 await self.clients.claim();
})()));
self.addEventListener('message',event=>{
 if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME});
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
 if(event.request.mode==='navigate'){event.respondWith(cacheFresh(event.request,ROOT.href));return;}
 const key=LOOKUP.get(url.pathname);if(key)event.respondWith(cacheFresh(event.request,key));
});
