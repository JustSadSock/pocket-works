const BUILD='5.9.1';
const RELEASE_DATE='2026-07-19';
const CACHE_NAME='blazon-v5.9.1';
const CACHE=CACHE_NAME;
const FINGERPRINT=new URL(self.location.href).searchParams.get('pw_fp')||'';
const REQUIRED=[
  './','./index.html','./styles.css','./war-council.css','./heraldry-v2.css','./campaign-command.css','./living-battle.css',
  './app.js','./banner-system.js','./war-council-runtime.js','./bootstrap.js','./engine.js','./core-engine.js','./spatial-core-engine.js','./progression-engine.js','./combat-clarity.js','./heraldry.js',
  './manifest.webmanifest','./icons/icon.svg',
  '../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/update-manager.css',
  '../../shared/workshop-mode.css','../../shared/workshop-mode.js','../../shared/pwa-utils.js',
  '../../shared/capabilities/storage.js','../../shared/capabilities/diagnostics.js','../../shared/capabilities/device.js','../../shared/capabilities/transfer.js'
];
const OPTIONAL=[
  './armorial-progression.css','./armorial-composition.css','./critical-readability.js','./progression-art.js',
  './progression-runtime.js','./armorial-composition-runtime.js','./release-indicator.js','./reset.html'
];
const RELEASE_NOTES=[
  'Исправлен бесконечный экран печати первого устава на iPhone.',
  'Переход больше не использует повторный программный клик и напрямую передаёт исходное нажатие игровому ядру.',
  'Если создание похода не завершилось, затемнение автоматически снимается и кнопку можно нажать повторно.',
  'Наблюдатели геральдического интерфейса гарантированно восстанавливаются после закрытия окна.'
];
async function fetchRelease(path,timeout=12000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);try{const url=new URL(path,self.registration.scope);url.searchParams.set('pw_release',BUILD);if(FINGERPRINT)url.searchParams.set('pw_fp',FINGERPRINT);const response=await fetch(url,{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error(`${path}: HTTP ${response.status}`);return response;}finally{clearTimeout(timer);}}
async function put(cache,path){const response=await fetchRelease(path);await cache.put(path,response);}
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await Promise.all(REQUIRED.map(path=>put(cache,path)));await Promise.allSettled(OPTIONAL.map(path=>put(cache,path)));await self.skipWaiting();})()));
self.addEventListener('message',event=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0].postMessage({version:BUILD,fingerprint:FINGERPRINT,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheName:CACHE,cacheProtocol:5});if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('blazon-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
async function networkFirst(request,fallback='./index.html'){try{const response=await fetch(new Request(request,{cache:'no-store'}));if(response.ok){const cache=await caches.open(CACHE);cache.put(request,response.clone()).catch(()=>{});return response;}}catch{}return(await caches.match(request,{ignoreSearch:true}))||(await caches.match(fallback,{ignoreSearch:true}))||Response.error();}
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.origin!==location.origin)return;if(event.request.mode==='navigate'){event.respondWith(networkFirst(event.request,'./index.html'));return;}if(['script','style','worker','manifest'].includes(event.request.destination)||/\.(?:js|css|webmanifest|json)$/i.test(url.pathname)){event.respondWith(networkFirst(event.request));return;}event.respondWith(caches.match(event.request,{ignoreSearch:true}).then(hit=>hit||networkFirst(event.request)));});
