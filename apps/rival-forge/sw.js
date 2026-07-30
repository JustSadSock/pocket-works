const CACHE='rival-forge-v1.2.0';
const APP_SHELL=['./','./index.html','./styles.css','./upgrade.css','./app.js','./store.js','./builder.js','./profiles.js','./catalog.js','./sheets.js','./data.js','./loadouts.js','./core.js','./manifest.webmanifest','./icons/icon.svg','../../shared/mobile-runtime.js','../../shared/update-manager.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('rival-forge-')&&key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()]));});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;const url=new URL(event.request.url),isPortrait=url.hostname==='rivalskins.com'&&url.pathname.includes('/hero-icons-avatars/');
  if(isPortrait){event.respondWith(caches.open(CACHE).then(async cache=>{const cached=await cache.match(event.request);const fresh=fetch(event.request).then(response=>{if(response.ok||response.type==='opaque')cache.put(event.request,response.clone());return response;}).catch(()=>cached);return cached||fresh;}));return;}
  if(url.origin===self.location.origin)event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));return response;}).catch(()=>caches.match('./index.html'))));
});
