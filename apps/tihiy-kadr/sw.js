const CACHE_PREFIX='tihiy-kadr-';
const CACHE='tihiy-kadr-v1.1.0';
const APP_VERSION='1.1.0';
const RELEASE_DATE='2026-10-25';
const RELEASE_NOTES=['Воспроизведение без примеси исходных диалогов','Четыре режима прослушивания и уровень выделенной речи','Более точная TIGER-DnR как альтернативная нейросеть','MRX и WebAssembly теперь загружаются через PocketWorks','Резервная загрузка ONNX и более понятные ошибки соединения','Исправлена загрузка ONNX WebAssembly на iPhone и в Safari','Резервный CDN для WebAssembly и понятные сетевые ошибки','Новый режим малой памяти для мобильных устройств','Нейросеть MRX удаляет диалоги локально','Три звуковые дорожки, настройки баланса и сравнение','Экспорт WAV и видео с новым звуком'];
const OWN=['./','./index.html','./app.js','./audio-utils.js','./mrx-worker.js','./styles.css','./manifest.webmanifest','./app.config.json','./icons/icon.svg','../../shared/mobile-runtime.css'];
const SCOPE=new URL('./',self.registration.scope);
const URLS=new Map(OWN.map(p=>{const u=new URL(p,SCOPE);return [u.pathname,u.href]}));
async function fresh(url){const u=new URL(url);u.searchParams.set('__pw_build',APP_VERSION);const r=await fetch(u.href,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return r}
self.addEventListener('install',e=>e.waitUntil((async()=>{const cache=await caches.open(CACHE);await Promise.all([...URLS.values()].map(async url=>cache.put(url,await fresh(url))))})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{await Promise.all((await caches.keys()).filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim()})()));
self.addEventListener('message',e=>{if(e.data?.type==='GET_UPDATE_INFO')e.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:2,cacheName:CACHE});if(e.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==self.location.origin)return;const url=URLS.get(e.request.mode==='navigate'?SCOPE.pathname:u.pathname);if(!url)return;e.respondWith((async()=>{try{const r=await fresh(url);const c=await caches.open(CACHE);c.put(url,r.clone());return r}catch{return await caches.match(url)||await caches.match(SCOPE.href)||Response.error()}})())});
