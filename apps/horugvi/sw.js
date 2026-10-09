const CACHE_PREFIX = 'horugvi-';
const CACHE_NAME = 'horugvi-v1.0.0';
const APP_VERSION = '1.0.0';
const RELEASE_DATE = '2026-10-09';
const CACHE_PROTOCOL = 2;
const RELEASE_NOTES = ['Три связанные битвы с ограниченными приказами, фланговыми атаками и моралью.','Рисованное поле боя, войска и витражные сцены хроники; автосохранение и звук.'];
const APP_SHELL = ['./','./index.html','./app.config.json','./styles.css','./app.js','./manifest.webmanifest','./icons/icon.svg','../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/update-manager.css','../../shared/update-manager.js'];
const SCOPE_URL = new URL('./', self.registration.scope);
const BUILD_TOKEN = `${APP_VERSION}-p${CACHE_PROTOCOL}`;
const SHELL_KEYS = new Map(APP_SHELL.map(entry=>{const u=new URL(entry,SCOPE_URL);return [u.pathname,u.href]}));
function freshUrl(input){const u=new URL(input instanceof Request?input.url:input,SCOPE_URL);u.searchParams.set('__pw_build',BUILD_TOKEN);return u}
async function fetchFresh(input){const r=await fetch(freshUrl(input),{cache:'no-store',credentials:'same-origin',redirect:'follow'});if(!r||!r.ok)throw Error(`Network ${r?.status||'unavailable'}`);return r}
async function precache(){const c=await caches.open(CACHE_NAME);await Promise.all([...new Set(SHELL_KEYS.values())].map(async u=>c.put(u,await fetchFresh(u))))}
self.addEventListener('install',e=>e.waitUntil(precache()));
self.addEventListener('message',e=>{if(e.data?.type==='GET_UPDATE_INFO')e.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME});if(e.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
async function networkFirst(req,canonical){try{const r=await fetchFresh(req);(await caches.open(CACHE_NAME)).put(canonical,r.clone());return r}catch{return await caches.match(canonical)||await caches.match(SCOPE_URL.href)||Response.error()}}
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==self.location.origin)return;if(e.request.mode==='navigate'){e.respondWith(networkFirst(e.request,SCOPE_URL.href));return}const canonical=SHELL_KEYS.get(u.pathname);if(canonical)e.respondWith(networkFirst(e.request,canonical))});