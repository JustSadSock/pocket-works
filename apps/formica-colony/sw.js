const CACHE_PREFIX='formica-colony-';
const CACHE_NAME='formica-colony-v1.0.0-p1';
const APP_VERSION='1.0.0';
const RELEASE_DATE='2026-09-16';
const CACHE_PROTOCOL=1;
const RELEASE_NOTES=['Непрерывный вертикальный мир с поверхностью, грунтом, тоннелями, влагой и расплодом.','Каждый муравей — отдельный агент: добывает пищу, охотится, роет и переносит грунт.','Наблюдение без прямого управления: камера, скорость времени, выбор особи, журнал и научные слои.'];
const APP_SHELL=['./','./index.html','./app.config.json','./styles.css','./app.js','./sim.js','./render.js','./manifest.webmanifest','./icons/icon.svg','../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/update-manager.css','../../shared/update-manager.js'];
const SCOPE_URL=new URL('./',self.registration.scope),BUILD_TOKEN=`${APP_VERSION}-p${CACHE_PROTOCOL}`,SHELL_KEYS=new Map(APP_SHELL.map(entry=>{const u=new URL(entry,SCOPE_URL);return[u.pathname,u.href]}));
function buildNetworkUrl(input){const u=new URL(input instanceof Request?input.url:input,SCOPE_URL);u.searchParams.set('__pw_build',BUILD_TOKEN);return u}
async function fresh(input){const r=await fetch(buildNetworkUrl(input),{cache:'no-store',credentials:'same-origin',redirect:'follow'});if(!r||!r.ok)throw new Error(`Fresh request failed: ${r?.status||'network'}`);return r}
async function precache(){const c=await caches.open(CACHE_NAME);await Promise.all([...new Set(SHELL_KEYS.values())].map(async u=>c.put(u,await fresh(u))))}
async function networkFirst(request,canonical,fallback=canonical){try{const r=await fresh(request),c=await caches.open(CACHE_NAME);await c.put(canonical,r.clone());return r}catch{return caches.match(canonical).then(x=>x||caches.match(fallback))}}
self.addEventListener('install',e=>e.waitUntil(precache()));
self.addEventListener('message',e=>{if(e.data?.type==='GET_UPDATE_INFO')e.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME});if(e.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==self.location.origin)return;if(e.request.mode==='navigate'){e.respondWith(networkFirst(e.request,SCOPE_URL.href,SCOPE_URL.href));return}const canonical=SHELL_KEYS.get(u.pathname);if(canonical)e.respondWith(networkFirst(e.request,canonical,SCOPE_URL.href))});