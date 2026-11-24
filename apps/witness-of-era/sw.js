const RELEASE_NOTES = ["Исправлена панель паузы, которая из-за CSS-конфликта всегда отображалась поверх игры и блокировала стартовый экран.","Обновлён офлайн-кэш, чтобы исправление гарантированно подхватывалось уже установленной версией приложения."];
const RELEASE_DATE = "2026-08-12";
const APP_VERSION = "1.0.1";
const CACHE_NAME='witness-of-era-v1.0.1';
const OWNED=["../../shared/update-manager.js","../../shared/update-manager.css","../../shared/pwa-utils.js",'./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icons/icon.svg','../../shared/mobile-runtime.css','../../shared/mobile-runtime.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(OWNED)))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('witness-of-era-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{if(!response||response.status!==200)return response;const copy=response.clone();const url=new URL(event.request.url);if(url.origin===location.origin&&url.pathname.includes('/apps/witness-of-era/'))caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match('./index.html'))))});

self.addEventListener('message',event=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:1,cacheName:"witness-of-era-v1.0.1"});if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
