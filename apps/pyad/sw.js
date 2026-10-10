const CACHE_PREFIX='pyad-';
const CACHE_NAME='pyad-v1.0.0';
const APP_VERSION='1.0.0';
const RELEASE_DATE='2026-10-10';
const CACHE_PROTOCOL=2;
const RELEASE_NOTES=['Первый выпуск: пять ночных набегов, трёхполосная оборона, вербовка ополчения и лучников.','Ручной пиксель-арт в низком разрешении, ожившая деревня, знаменосец и маленькая осада.','Автосохранение, автономная PWA, звуковое сопровождение и игровая хроника.'];
const APP_SHELL=['./','./index.html','./app.config.json','./styles.css','./app.js','./manifest.webmanifest','./icons/icon.svg','./visual-direction.json','../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/update-manager.css','../../shared/update-manager.js'];
const SCOPE_URL=new URL('./',self.registration.scope);
const BUILD_TOKEN=`${APP_VERSION}-p${CACHE_PROTOCOL}`;
const SHELL_KEYS=new Map(APP_SHELL.map(entry=>{const url=new URL(entry,SCOPE_URL);return [url.pathname,url.href]}));
function fresh(input){const url=new URL(input instanceof Request?input.url:input,SCOPE_URL);url.searchParams.set('__pw_build',BUILD_TOKEN);return url}
async function fetchFresh(input){const r=await fetch(fresh(input),{cache:'no-store',credentials:'same-origin',redirect:'follow'});if(!r.ok)throw Error(`Status ${r.status}`);return r}
async function precache(){const cache=await caches.open(CACHE_NAME);await Promise.all([...new Set(SHELL_KEYS.values())].map(async url=>cache.put(url,await fetchFresh(url))))}
self.addEventListener('install',event=>event.waitUntil(precache()));
self.addEventListener('message',event=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME});if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
async function networkFirst(request,canonical){try{const r=await fetchFresh(request);(await caches.open(CACHE_NAME)).put(canonical,r.clone());return r}catch{return await caches.match(canonical)||await caches.match(SCOPE_URL.href)||Response.error()}}
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;if(event.request.mode==='navigate'){event.respondWith(networkFirst(event.request,SCOPE_URL.href));return}const key=SHELL_KEYS.get(url.pathname);if(key)event.respondWith(networkFirst(event.request,key))});