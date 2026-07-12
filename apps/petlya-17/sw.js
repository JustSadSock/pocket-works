const CACHE_PREFIX='petlya-17-';
const CACHE_NAME='petlya-17-v1.0.0';
const APP_VERSION='1.0.0';
const RELEASE_DATE='2026-07-12';
const RELEASE_NOTES=[
  'Добавлен полный трёхкруговой заезд от первого лица против пяти соперников.',
  'Добавлены управление наклоном телефона, сенсорные газ и тормоз, а также пальцевый и клавиатурный резерв.',
  'Добавлены воздушный след, столкновения, позиционная борьба, результаты и локальные рекорды.',
  'Добавлены кабина, приборы, зеркала, звук двигателя, вибрация, офлайн-режим и возврат в Pocket Works.'
];
const APP_SHELL=[
  './','./index.html','./app.config.json','./styles.css','./app.js','./manifest.webmanifest','./icons/icon.svg',
  '../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/pwa-utils.js',
  '../../shared/update-manager.css','../../shared/update-manager.js','../../shared/workshop-mode.css','../../shared/workshop-mode.js',
  '../../shared/capabilities/motion.js','../../shared/capabilities/storage.js','../../shared/capabilities/transfer.js',
  '../../shared/capabilities/audio.js','../../shared/capabilities/device.js','../../shared/capabilities/diagnostics.js'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL))));
self.addEventListener('message',event=>{
  if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES});
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put('./',copy));return response}).catch(()=>caches.match('./')));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(!response||response.status!==200||response.type==='opaque')return response;const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));return response})));
});
