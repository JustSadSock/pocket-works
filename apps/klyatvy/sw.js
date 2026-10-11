const CACHE_NAME = 'klyatvy-v1.0.0';
const PATHS = ['./','./index.html','./app.js','./engine.js','./world.js','./styles.css','./manifest.webmanifest','./icons/icon.svg','./app.config.json','../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/update-manager.css','../../shared/update-manager.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(PATHS))); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(names => Promise.all(names.filter(n => n.startsWith('klyatvy-') && n !== CACHE_NAME).map(n => caches.delete(n)))).then(() => self.clients.claim())); });
self.addEventListener('message', e => {
 if(e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
 if(e.data && e.data.type === 'GET_UPDATE_INFO' && e.ports && e.ports[0]) e.ports[0].postMessage({version:'1.0.0',releaseDate:'2026-10-11',releaseNotes:['Первая версия стратегии Клятвы'],cacheProtocol:2,cacheName:CACHE_NAME});
});
self.addEventListener('fetch', e => {
 if(e.request.method !== 'GET') return;
 const url = new URL(e.request.url);
 if(url.origin !== self.location.origin) return;
 e.respondWith(fetch(e.request).catch(() => caches.match(e.request).then(res => res || (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});