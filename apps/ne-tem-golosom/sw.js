const CACHE_PREFIX='ne-tem-golosom-';
const CACHE='ne-tem-golosom-v1.2.0';
const APP_VERSION='1.2.0';
const RELEASE_DATE='2026-10-24';
const RELEASE_NOTES=['Визуальный выбор фрагмента на киноленте','Подготовка на ПК без лишней вертикальной прокрутки','Единая кнопка подтверждения и просмотр исходника и результата','Локальная видеомастерская: обрезка, качество и предпросмотр после обработки','До 96 МиБ видео для комнат и до 512 МиБ исходного файла','Фрагментарная озвучка и монтаж на киноленте; улучшенная кооперативная премьера','Фрагментарная запись на мобильных устройствах и компьютерах','PocketNet-комнаты, прямой обмен файлами, локальные черновики'];
const OWN=['./','./index.html','./app.js','./media-lab.js','./trim-range.js','./styles.css','./manifest.webmanifest','./app.config.json','./icons/icon.svg','../../shared/mobile-runtime.js','../../shared/mobile-runtime.css','../../shared/capabilities/net.js','../../shared/capabilities/identity.js'];
const SCOPE=new URL('./',self.registration.scope);
const URLS=new Map(OWN.map(p=>{const u=new URL(p,SCOPE);return [u.pathname,u.href]}));
async function fetchCurrent(url){const u=new URL(url);u.searchParams.set('__pw_build',APP_VERSION);const r=await fetch(u.href,{cache:'no-store',credentials:'same-origin'});if(!r.ok)throw Error('HTTP '+r.status);return r}
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE);await Promise.all([...URLS.values()].map(async url=>{const r=await fetchCurrent(url);await c.put(url,r)}))})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{await Promise.all((await caches.keys()).filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim()})()));
self.addEventListener('message',e=>{if(e.data?.type==='GET_UPDATE_INFO')e.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:2,cacheName:CACHE});if(e.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==self.location.origin)return;const key=e.request.mode==='navigate'?SCOPE.pathname:u.pathname;const url=URLS.get(key);if(!url)return;e.respondWith((async()=>{try{const fresh=await fetchCurrent(url);const c=await caches.open(CACHE);c.put(url,fresh.clone());return fresh}catch{return await caches.match(url)||await caches.match(SCOPE.href)||Response.error()}})())});
