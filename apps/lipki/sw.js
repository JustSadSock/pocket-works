
const CACHE_PREFIX='lipki-';
const CACHE_NAME='lipki-v1.0.0';
const APP_VERSION='1.0.0';
const RELEASE_DATE='2026-10-12';
const CACHE_PROTOCOL=2;
const RELEASE_NOTES=["Новая физическая 2D-игра: прыжки, прилипающие герои, упругие шары, кнопки, двери и пружины.","12 коротких уровней, одиночная тренировка с сохранением прогресса и интернет-комнаты PocketNet на 2–4 игрока.","Авторский фетровый мир, сенсорное и клавиатурное управление, Pocket ID и offline-first PWA."];
const APP_SHELL=['./','./index.html','./app.config.json','./styles.css','./app.js','./game-core.js','./render.js',
 './manifest.webmanifest','./icons/icon.svg','../../shared/mobile-runtime.css','../../shared/mobile-runtime.js',
 '../../shared/update-manager.js','../../shared/update-manager.css','../../shared/workshop-mode.js','../../shared/workshop-mode.css',
 '../../shared/pwa-utils.js','../../shared/capabilities/identity.js','../../shared/capabilities/net.js',
 '../../shared/capabilities/storage.js','../../shared/capabilities/transfer.js','../../shared/capabilities/audio.js',
 '../../shared/capabilities/device.js','../../shared/capabilities/diagnostics.js','../../shared/capabilities/motion.js'];
const SCOPE_URL=new URL('./',self.registration.scope),TOKEN=APP_VERSION+'-p'+CACHE_PROTOCOL;
const FILES=new Map(APP_SHELL.map(path=>{const url=new URL(path,SCOPE_URL);return [url.pathname,url.href]}));
async function fresh(url){const target=new URL(url);target.searchParams.set('__pw_build',TOKEN);const res=await fetch(target.href,{cache:'no-store',credentials:'same-origin'});if(!res.ok)throw Error('Asset '+res.status);return res;}
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE_NAME);await Promise.all([...new Set(FILES.values())].map(async url=>{const res=await fresh(url);await cache.put(url,res)}));})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(v=>v.startsWith(CACHE_PREFIX)&&v!==CACHE_NAME).map(k=>caches.delete(k)));await self.clients.claim();})()));
self.addEventListener('message',event=>{
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
 if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME});
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
 const target=event.request.mode==='navigate'?SCOPE_URL.href:FILES.get(url.pathname);if(!target)return;
 event.respondWith((async()=>{try{const res=await fresh(event.request.url);const cache=await caches.open(CACHE_NAME);await cache.put(target,res.clone());return res;}catch{return (await caches.match(target))||Response.error();}})());
});
