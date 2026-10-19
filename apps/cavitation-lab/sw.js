const CACHE_PREFIX='cavitation-lab-';
const CACHE_NAME='cavitation-lab-v1.3.0';
const APP_VERSION='1.3.0';
const RELEASE_DATE='2026-10-19';
const CACHE_PROTOCOL=2;
const RELEASE_NOTES=['Potential-flow interface deformation, directed liquid-tongue precursor, shape magnification and vector flow.'];
const APP_SHELL=[
 './','./index.html','./styles.css','./app.js','./render.js','./cloud-render.js','./physics.js','./coupling.js','./constructor.js','./surface-flow.js','./surface-render.js','./app.config.json',
 './manifest.webmanifest','./icons/icon.svg',
 '../../shared/mobile-runtime.css','../../shared/mobile-runtime.js',
 '../../shared/update-manager.css','../../shared/update-manager.js',
 '../../shared/workshop-mode.css','../../shared/workshop-mode.js'
];
const SCOPE_URL=new URL('./',self.registration.scope);
const BUILD_TOKEN=APP_VERSION+'-p'+CACHE_PROTOCOL;
const SHELL_KEYS=new Map(APP_SHELL.map(entry=>{const url=new URL(entry,SCOPE_URL);return[url.pathname,url.href]}));
function freshUrl(input){const url=new URL(input instanceof Request?input.url:input,SCOPE_URL);url.searchParams.set('__pw_build',BUILD_TOKEN);return url}
async function fresh(input){
 const response=await fetch(freshUrl(input),{cache:'no-store',credentials:'same-origin',redirect:'follow'});
 if(!response?.ok)throw Error('Fresh shell request failed: '+(response?.status||'offline'));
 return response;
}
async function cacheShell(){
 const cache=await caches.open(CACHE_NAME);
 await Promise.all([...new Set(SHELL_KEYS.values())].map(async url=>cache.put(url,await fresh(url))));
}
async function networkFirst(request,canonical,fallback=canonical){
 try{const response=await fresh(request);const cache=await caches.open(CACHE_NAME);await cache.put(canonical,response.clone());return response}
 catch{return await caches.match(canonical)||await caches.match(fallback)||Response.error()}
}
self.addEventListener('install',event=>event.waitUntil(cacheShell()));
self.addEventListener('message',event=>{
 if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME});
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const u=new URL(event.request.url);if(u.origin!==self.location.origin)return;
 if(event.request.mode==='navigate'){event.respondWith(networkFirst(event.request,SCOPE_URL.href));return}
 const canonical=SHELL_KEYS.get(u.pathname);
 if(canonical)event.respondWith(networkFirst(event.request,canonical,SCOPE_URL.href));
});
