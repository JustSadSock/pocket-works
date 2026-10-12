const CACHE_PREFIX='palomnik-';
const CACHE_NAME='palomnik-v1.0.0';
const APP_VERSION='1.0.0', RELEASE_DATE='2026-10-12',CACHE_PROTOCOL=2;
const RELEASE_NOTES=[
  "Новая атмосферная одиночная экспедиция с тремя биомами, тремя типами риска, маршрутом из 21 шага и сохранением.",
  "Авторская низкоразрешённая псевдообъёмная графика с упорядоченным дизерингом, шагающая крепость, анимированные опоры и погода.",
  "Управление касанием по опорам, пауза, звук с отключением, офлайн-режим и полноценный исход экспедиции."
];
const APP_SHELL=['./','./index.html','./app.config.json','./styles.css','./app.js','./manifest.webmanifest','./icons/icon.svg','../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/update-manager.css','../../shared/update-manager.js','../../shared/pwa-utils.js','../../shared/capabilities/motion.js','../../shared/capabilities/storage.js','../../shared/capabilities/transfer.js','../../shared/capabilities/audio.js','../../shared/capabilities/device.js','../../shared/capabilities/diagnostics.js'];
const ROOT=new URL('./',self.registration.scope);
const TOKEN=APP_VERSION+'-p'+CACHE_PROTOCOL;
const KNOWN=new Map(APP_SHELL.map(path=>{const url=new URL(path,ROOT);return [url.pathname,url.href]}));
function freshUrl(request){const url=new URL(request instanceof Request?request.url:request,ROOT);url.searchParams.set('__pw_build',TOKEN);return url;}
async function network(request){const response=await fetch(freshUrl(request),{cache:'no-store',credentials:'same-origin',redirect:'follow'});if(!response.ok)throw new Error('HTTP '+response.status);return response;}
async function update(request,canonical,fallback=canonical){try{const response=await network(request),cache=await caches.open(CACHE_NAME);await cache.put(canonical,response.clone());return response;}catch{return (await caches.match(canonical))||(await caches.match(fallback))||Response.error();}}
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE_NAME);await Promise.all([...new Set(KNOWN.values())].map(async url=>cache.put(url,await network(url))));})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key)));await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME});if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;if(event.request.mode==='navigate'){event.respondWith(update(event.request,ROOT.href));return;}const known=KNOWN.get(url.pathname);if(known)event.respondWith(update(event.request,known));});