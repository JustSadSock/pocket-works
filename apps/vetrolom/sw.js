const CACHE_PREFIX='vetrolom-';
const CACHE='vetrolom-v1.3.0';
const VERSION='1.3.0';
const RELEASE_DATE='2026-07-17';
const RELEASE_NOTES=[
  'Новые находки, источники, смола, еда и штормовой фонарь.',
  'Умные лагерные действия, лента добычи и более насыщенные взаимодействия.',
  'Живой свет, ветер, следы, светлячки и биомная звуковая атмосфера.'
];
const SHELL=[
  './','./index.html','./app.config.json','./styles.css','./polish-1.1.css','./polish-1.2.css','./polish-1.3.css','./app.js','./manifest.webmanifest','./icons/icon.svg',
  './runtime/part-00.txt','./runtime/part-01.txt','./runtime/part-02.txt','./runtime/part-03.txt','./runtime/part-04.txt','./runtime/part-05.txt','./runtime/patch-1.2.txt','./runtime/patch-1.3-a.txt','./runtime/patch-1.3-b.txt','./runtime/patch-1.3-c.txt',
  '../../shared/mobile-runtime.css','../../shared/update-manager.css','../../shared/update-manager.js'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
  if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheName:CACHE});
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{
    if(!response||!response.ok)return response;
    const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;
  }).catch(()=>event.request.mode==='navigate'?caches.match('./index.html'):Response.error())));
});
