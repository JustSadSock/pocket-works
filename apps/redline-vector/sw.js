const CACHE_NAME='redline-vector-v1.0.0';
const CACHE_PREFIX='redline-vector-';
const ASSETS=['./','./index.html','./styles.css','./app.js','./chunks/app-01.txt','./chunks/app-02.txt','./chunks/app-03.txt','./chunks/app-04.txt','./chunks/app-05.txt','./chunks/app-06.txt','./manifest.webmanifest','./icons/icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));}return response;}).catch(()=>caches.match('./index.html'))));});
