const CACHE_PREFIX='ne-moya-problema-';
const CACHE_NAME='ne-moya-problema-v1.0.0';
const APP_VERSION='1.0.0';
const RELEASE_DATE='2026-10-11';
const CACHE_PROTOCOL=2;
const RELEASE_NOTES=["Первая полноценная локальная партия на 3–8 игроков с тремя происшествиями, тайными целями и обвинениями.","Шесть катастроф, восемь должностей, десятки решений и анимированное изометрическое бюро.","Автосохранение партии, безопасная передача телефона, финальный рейтинг, звук и офлайн-PWA."];
const SHELL=['./','./index.html','./app.config.json','./styles.css','./app.js','./scene.js','./data.js','./manifest.webmanifest','./icons/icon.svg','../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/pwa-utils.js','../../shared/update-manager.css','../../shared/update-manager.js'];
const SCOPE=new URL('./',self.registration.scope),BUILD=APP_VERSION+'-p'+CACHE_PROTOCOL,KEYS=new Map(SHELL.map(p=>{const u=new URL(p,SCOPE);return [u.pathname,u.href]}));
function fresh(url){const u=new URL(url instanceof Request?url.url:url,SCOPE);u.searchParams.set('__pw_build',BUILD);return fetch(u,{cache:'no-store',credentials:'same-origin'}).then(r=>{if(!r.ok)throw Error('Fresh response '+r.status);return r})}
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE_NAME).then(cache=>Promise.all([...new Set(KEYS.values())].map(async url=>cache.put(url,await fresh(url))))));
self.addEventListener('message',event=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME});if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
async function networkFirst(input,url){try{const r=await fresh(input);const c=await caches.open(CACHE_NAME);await c.put(url,r.clone());return r}catch{return (await caches.match(url))||(await caches.match(SCOPE.href))||Response.error()}}
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==self.location.origin)return;if(e.request.mode==='navigate'){e.respondWith(networkFirst(e.request,SCOPE.href));return}const key=KEYS.get(u.pathname);if(key)e.respondWith(networkFirst(e.request,key))});
