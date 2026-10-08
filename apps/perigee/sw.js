const PREFIX='perigee-';
const CACHE='perigee-v1.0.0-p2';
const VERSION='1.0.0';
const NOTES=['Шесть орбитальных миссий','Кинематографическая графика и прогноз курса','Офлайн PWA и сохранения'];
const ASSETS=['./','./index.html','./app.config.json','./styles.css','./app.js','./physics.js','./renderer.js','./manifest.webmanifest','./icons/icon.svg','../../shared/mobile-runtime.css','../../shared/mobile-runtime.js'];
const SCOPE=new URL('./',self.registration.scope);
const KEYS=new Map(ASSETS.map(path=>{const url=new URL(path,SCOPE);return [url.pathname,url.href];}));
function tagged(value){const url=new URL(value instanceof Request?value.url:value,SCOPE);url.searchParams.set('__pw_build',VERSION+'-p2');return url;}
async function fresh(request){const response=await fetch(tagged(request),{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw Error('Request failed: '+response.status);return response;}
async function fromNetwork(request,canonical,fallback=canonical){
  try{const response=await fresh(request);const cache=await caches.open(CACHE);await cache.put(canonical,response.clone());return response;}
  catch{const result=await caches.match(canonical);return result||await caches.match(fallback)||Response.error();}
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await Promise.all([...new Set(KEYS.values())].map(async url=>cache.put(url,await fresh(url))));
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  await Promise.all((await caches.keys()).filter(name=>name.startsWith(PREFIX)&&name!==CACHE).map(name=>caches.delete(name)));
  await self.clients.claim();
})()));
self.addEventListener('message',event=>{
  if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:VERSION,releaseDate:'2026-10-08',releaseNotes:NOTES,cacheProtocol:2,cacheName:CACHE});
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){event.respondWith(fromNetwork(event.request,SCOPE.href));return;}
  const canonical=KEYS.get(url.pathname);
  if(canonical)event.respondWith(fromNetwork(event.request,canonical,SCOPE.href));
});