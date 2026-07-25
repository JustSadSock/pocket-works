const VERSION='1.0.0';
const PREFIX='veshchestvo-';
const CACHE=`${PREFIX}v${VERSION}`;
const ASSETS=['./','./index.html','./app.js','./styles.css','./manifest.webmanifest','./icons/icon.svg','./app.config.json','./README.md','./LICENSE','./ATTRIBUTION.md'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>event.request.mode==='navigate'?caches.match('./index.html'):Response.error())));});
self.addEventListener('message',event=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:VERSION,releaseDate:'2026-07-25'});if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
