const CACHE_PREFIX='chernye-znamena-';
const CACHE_NAME='chernye-znamena-v0.3.0';
const APP_VERSION='0.3.0',RELEASE_DATE='2026-10-28',CACHE_PROTOCOL=2;
const RELEASE_NOTES=["Этап III: снабжение от столицы по непрерывной цепи владений. Изоляция истощает армии и гарнизоны, прерывает набор и укрепления.","Блокады замков: осада истощает гарнизон каждый сезон; крепость капитулирует, если осада достаточно долгая и оборона рухнула. Осады можно снять или перейти к штурму.","Набеги без завоевания: серебро и ущерб гарнизону ценой собственных потерь, временная экономическая разруха в области.","Новая тактическая карта замка с защищающими стенами и воротным проломом. Стратегический ИИ учитывает снабжение, пробует блокаду и рейд вместо самоубийственных штурмов.","Осадные и логистические метки непосредственно на карте, новый устав и тесты с совместимостью сохранений версии 0.2.0."];
const APP_SHELL=['./','./index.html','./styles.css','./app.js','./rules.mjs','./campaign.mjs','./campaign-ui.mjs','./campaign.css','./app.config.json','./manifest.webmanifest','./icons/icon.svg',
'../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/update-manager.css','../../shared/update-manager.js','../../shared/workshop-mode.css','../../shared/workshop-mode.js','../../shared/pwa-utils.js',
'../../shared/capabilities/storage.js','../../shared/capabilities/motion.js','../../shared/capabilities/transfer.js','../../shared/capabilities/audio.js','../../shared/capabilities/device.js','../../shared/capabilities/diagnostics.js'];
const SCOPE_URL=new URL('./',self.registration.scope);
const BUILD_TOKEN=APP_VERSION+'-p'+CACHE_PROTOCOL;
const SHELL_KEYS=new Map(APP_SHELL.map(path=>{const u=new URL(path,SCOPE_URL);return [u.pathname,u.href];}));
async function fetchFresh(input){
 const url=new URL(input instanceof Request?input.url:input,SCOPE_URL);url.searchParams.set('__pw_build',BUILD_TOKEN);
 const response=await fetch(url,{cache:'no-store',credentials:'same-origin',redirect:'follow'});
 if(!response.ok)throw new Error('HTTP '+response.status);return response;
}
async function networkFirst(request,key,fallback=key){
 try{const response=await fetchFresh(request),cache=await caches.open(CACHE_NAME);await cache.put(key,response.clone());return response;}
 catch{return await caches.match(key)||await caches.match(fallback)||Response.error();}
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE_NAME);
 await Promise.all([...new Set(SHELL_KEYS.values())].map(async url=>{const response=await fetchFresh(url);await cache.put(url,response);}));
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)));await self.clients.claim();
})()));
self.addEventListener('message',event=>{
 if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME});
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
 if(event.request.mode==='navigate'){event.respondWith(networkFirst(event.request,SCOPE_URL.href));return;}
 const key=SHELL_KEYS.get(url.pathname);if(key)event.respondWith(networkFirst(event.request,key,SCOPE_URL.href));
});
