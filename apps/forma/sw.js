const CACHE='forma-v2.0.0';
const ASSETS=['./','./index.html','./styles.css','./bootstrap.js','./app.js','./manifest.webmanifest','./icons/icon.svg','./FORMA-AI-GUIDE.md','./src/cad-project.js','./src/scad.js','./src/contract.js','./src/blueprint.js','./src/blueprint-runtime.js','./src/engine.js','./src/mesher.js','./src/renderer.js','./src/exporters.js','./src/spec.js','./src/worker.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('forma-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{if(response&&response.ok&&new URL(event.request.url).origin===location.origin){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;}).catch(()=>caches.match('./index.html'))));
});
