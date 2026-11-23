const CACHE_PREFIX = 'emergent-kingdoms-';
const CACHE_NAME = 'emergent-kingdoms-v1.0.0';
const APP_VERSION = '1.0.0';
const RELEASE_DATE = '2026-11-24';
const CACHE_PROTOCOL = 2;
const RELEASE_NOTES = [
  "Детерминированный мир, демография, миграция, экономика, культуры и государства.",
  "Семь слоёв карты, дипломатия, войны, торговля и история государств.",
  "Вмешательства, разветвление истории, сравнение, архив и JSON-экспорт."
];
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.config.json",
  "./styles.css",
  "./app.js",
  "./engine.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "../../shared/mobile-runtime.css",
  "../../shared/mobile-runtime.js",
  "../../shared/update-manager.css",
  "../../shared/update-manager.js"
];
const SCOPE_URL = new URL('./', self.registration.scope);
const BUILD_TOKEN = APP_VERSION + '-p' + CACHE_PROTOCOL;
const SHELL_KEYS = new Map(APP_SHELL.map((entry) => {
  const url = new URL(entry, SCOPE_URL);
  return [url.pathname, url.href];
}));
function freshUrl(input){
  const url = new URL(input instanceof Request ? input.url : input, SCOPE_URL);
  url.searchParams.set('__pw_build', BUILD_TOKEN);
  return url;
}
async function fetchFresh(input){
  const response = await fetch(freshUrl(input), {cache:'no-store',credentials:'same-origin',redirect:'follow'});
  if(!response || !response.ok) throw new Error('Cannot fetch app shell: ' + (response?.status||'network'));
  return response;
}
async function installShell(){
  const cache = await caches.open(CACHE_NAME);
  await Promise.all([...new Set(SHELL_KEYS.values())].map(async (url) => {
    const response = await fetchFresh(url);
    await cache.put(url,response);
  }));
}
async function networkFirst(request,canonical){
  try{
    const response=await fetchFresh(request);
    const cache=await caches.open(CACHE_NAME);
    await cache.put(canonical,response.clone());
    return response;
  }catch{
    return (await caches.match(canonical)) || (await caches.match(SCOPE_URL.href)) ||
      new Response('Эксперимент недоступен офлайн. Откройте приложение при подключении.',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});
  }
}
self.addEventListener('install',(event)=>event.waitUntil(installShell()));
self.addEventListener('message',(event)=>{
  if(event.data?.type==='GET_UPDATE_INFO')
    event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME});
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('activate',(event)=>event.waitUntil(caches.keys().then(keys=>
  Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key))))
  .then(()=>self.clients.claim())));
self.addEventListener('fetch',(event)=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(networkFirst(event.request,SCOPE_URL.href));return;
  }
  const canonical=SHELL_KEYS.get(url.pathname);
  if(canonical)event.respondWith(networkFirst(event.request,canonical));
});
