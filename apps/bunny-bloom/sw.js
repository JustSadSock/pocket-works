const CACHE_PREFIX='bunny-bloom-';
const APP_VERSION="1.2.0";
const RELEASE_DATE="2026-11-05";
const RELEASE_NOTES=[
  "На поляне появляются звездопады каждые четыре букета — лови светящиеся звёзды и получай награды.",
  "Заяц получил новую покадровую анимацию прыжка от ImageGen при нажатии.",
  "Добавлена коллекционная статистика ночных событий, адаптация под мобильный экран и улучшенные визуальные эффекты."
];
const CACHE_PROTOCOL=2;
const CACHE_NAME="bunny-bloom-v1.2.0";
const SHELL=[
 './','./index.html','./app.config.json','./styles.css','./garden-v2.css','./world-v3.css',
 './app.js','./garden-v2.js','./world-v3.js','./pogo-asset.js','./qa.plan.json','./manifest.webmanifest','./icons/icon.svg',
 '../../shared/mobile-runtime.css','../../shared/mobile-runtime.js',
 '../../shared/update-manager.js','../../shared/update-manager.css',
 '../../shared/workshop-mode.css','../../shared/workshop-mode.js',
 '../../shared/capabilities/motion.js','../../shared/capabilities/storage.js','../../shared/capabilities/transfer.js',
 '../../shared/capabilities/audio.js','../../shared/capabilities/device.js','../../shared/capabilities/diagnostics.js'
];
const APP_URL=new URL('./',self.registration.scope);
const URLS=new Map(SHELL.map(path=>{const url=new URL(path,APP_URL);return [url.pathname,url.href]}));
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE_NAME);
 await Promise.all([...new Set(URLS.values())].map(async url=>{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error('Asset '+r.status+': '+url);await cache.put(url,r)}));
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();await Promise.all(keys.filter(x=>x.startsWith(CACHE_PREFIX)&&x!==CACHE_NAME).map(x=>caches.delete(x)));
 await self.clients.claim();
})()));
self.addEventListener('message',event=>{
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
 if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,appVersion:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME});
});
async function fresh(request,key){
 try{const response=await fetch(request);if(!response||!response.ok)throw new Error('Network unavailable');
 const cache=await caches.open(CACHE_NAME);await cache.put(key,response.clone());return response}
 catch{return(await caches.match(key))||(await caches.match(APP_URL.href))||new Response('Не удалось открыть приложение без сети',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}})}
}
self.addEventListener('fetch',event=>{
 const request=event.request;if(request.method!=='GET')return;
 const url=new URL(request.url);if(url.origin!==self.location.origin)return;
 if(request.mode==='navigate'&&url.pathname.startsWith(APP_URL.pathname)){event.respondWith(fresh(request,APP_URL.href));return}
 const key=URLS.get(url.pathname);if(key)event.respondWith(fresh(request,key));
});
