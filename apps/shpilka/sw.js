const CACHE_PREFIX='shpilka-';
const CACHE_NAME='shpilka-v2.8.2-p1';
const APP_VERSION='2.8.2';
const RELEASE_DATE='2026-07-15';
const CACHE_PROTOCOL=1;
const RELEASE_NOTES=[
'Возвращены окружение, поребрики и гоночная линия в совместимый iPhone-рендер.',
'Рекорды, медали, сектора и призраки разделены по полному коду маршрута.',
'Добавлены архив маршрутов, предупреждения о прыжках и аварийное восстановление заезда.'
];
const APP_SHELL=[
'./','./index.html','./app.config.json','./styles.css','./advanced.css','./advanced-fixes.css','./systems-23.css','./systems-25.css','./systems-26.css','./systems-27.css','./systems-28.css','./systems-282.css','./app.js',
...Array.from({length:11},(_,i)=>`./engine-v2-${String(i+1).padStart(2,'0')}.js`),
'./engine-v2-stability.js','./engine-v2-advanced.js','./engine-v2-advanced-fixes.js','./engine-v2-23-ui.js','./engine-v2-23.js','./engine-v2-23-fixes.js','./engine-v2-24.js','./engine-v2-25-ai.js','./engine-v2-25-race.js','./engine-v2-25-1.js','./engine-v2-25-contacts.js','./engine-v2-25-wall.js','./engine-v2-26-career.js','./engine-v2-26-racecraft.js','./engine-v2-26-landmarks.js','./engine-v2-26-feel.js','./engine-v2-26-fixes.js','./engine-v2-27-ai.js','./engine-v2-27-fixes.js','./engine-v2-27-1.js','./engine-v2-27-2.js','./engine-v2-28-route.js','./engine-v2-28-ai.js','./engine-v2-28-physics.js','./engine-v2-28-fixes.js','./engine-v2-28-ui.js','./engine-v2-28-1.js','./engine-v2-28-2.js','./engine-v2-12.js','./workshop.js','./manifest.webmanifest','./icons/icon.svg','../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/pwa-utils.js','../../shared/update-manager.css','../../shared/update-manager.js','../../shared/workshop-mode.css','../../shared/workshop-mode.js','../../shared/capabilities/motion.js','../../shared/capabilities/storage.js','../../shared/capabilities/transfer.js','../../shared/capabilities/audio.js','../../shared/capabilities/device.js','../../shared/capabilities/diagnostics.js'];
const SCOPE_URL=new URL('./',self.registration.scope);
const BUILD_TOKEN=`${APP_VERSION}-p${CACHE_PROTOCOL}`;
const SHELL_KEYS=new Map(APP_SHELL.map(entry=>{const url=new URL(entry,SCOPE_URL);return[url.pathname,url.href];}));
function buildNetworkUrl(input){const url=new URL(input instanceof Request?input.url:input,SCOPE_URL);url.searchParams.set('__pw_build',BUILD_TOKEN);return url;}
async function fetchFresh(input){const response=await fetch(buildNetworkUrl(input),{cache:'no-store',credentials:'same-origin',redirect:'follow'});if(!response?.ok)throw new Error(`Fresh application request failed: ${response?.status||'network'}`);return response;}
async function precacheFreshShell(){const cache=await caches.open(CACHE_NAME);await Promise.all([...new Set(SHELL_KEYS.values())].map(async url=>cache.put(url,await fetchFresh(url))));}
async function networkFirstFresh(request,canonicalUrl,fallbackUrl=canonicalUrl){try{const response=await fetchFresh(request);const cache=await caches.open(CACHE_NAME);await cache.put(canonicalUrl,response.clone());return response;}catch{return caches.match(canonicalUrl).then(cached=>cached||caches.match(fallbackUrl));}}
self.addEventListener('install',event=>event.waitUntil(precacheFreshShell()));
self.addEventListener('message',event=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0].postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME});if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const requestUrl=new URL(event.request.url);if(requestUrl.origin!==self.location.origin)return;if(event.request.mode==='navigate'){event.respondWith(networkFirstFresh(event.request,SCOPE_URL.href,SCOPE_URL.href));return;}const canonicalUrl=SHELL_KEYS.get(requestUrl.pathname);if(canonicalUrl)event.respondWith(networkFirstFresh(event.request,canonicalUrl,SCOPE_URL.href));});
