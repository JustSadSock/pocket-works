const CACHE_PREFIX='vetrolom-';
const CACHE='vetrolom-v1.0.0';
const VERSION='1.0.0';
const RELEASE_DATE='2026-07-17';
const RELEASE_NOTES=[
  'Процедурная долина с шестью биомами, погодой, сменой суток и руинами.',
  'Выживание, ремесло, строительство лагеря, земледелие и локальные сохранения.',
  'Три погодные вышки, Сердце Бури, RPG-перки, ночные существа и свободная песочница.'
];
const SHELL=[
  './','./index.html','./app.config.json','./styles.css','./app.js','./manifest.webmanifest','./icons/icon.svg',
  './runtime/part-00.txt','./runtime/part-01.txt','./runtime/part-02.txt','./runtime/part-03.txt','./runtime/part-04.txt','./runtime/part-05.txt',
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
