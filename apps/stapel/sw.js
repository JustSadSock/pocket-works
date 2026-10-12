const CACHE_PREFIX='stapel-';
const CACHE_NAME='stapel-v1.0.0';
const APP_VERSION='1.0.0';
const RELEASE_DATE='2026-10-12', CACHE_PROTOCOL=2;
const RELEASE_NOTES=[
  "Новая марсианская инженерная песочница: 1–3 ступени, выбор двигателей, топливных баков и стабилизаторов.",
  "Три контракта на доставку грузов на целевую орбиту; реалистичная динамика с притяжением Марса, атмосферным сопротивлением и расходом топлива.",
  "Автопилот, ручной тангаж, тяга, разделение ступеней, ускорение времени, карта орбиты и отчёты по полётам."
];
const APP_SHELL=[
  './','./index.html','./app.config.json','./app.js','./physics.js','./renderer.js',
  './styles.css','./manifest.webmanifest','./icons/icon.svg',
  '../../shared/mobile-runtime.css','../../shared/mobile-runtime.js',
  '../../shared/update-manager.css','../../shared/update-manager.js',
  '../../shared/capabilities/motion.js','../../shared/capabilities/storage.js',
  '../../shared/capabilities/transfer.js','../../shared/capabilities/audio.js',
  '../../shared/capabilities/device.js','../../shared/capabilities/diagnostics.js',
  '../../shared/workshop-mode.js','../../shared/workshop-mode.css'
];
const SCOPE=new URL('./',self.registration.scope);
const KEYS=new Map(APP_SHELL.map(path=>{const u=new URL(path,SCOPE);return [u.pathname,u.href]}));
async function fresh(input){
  const u=new URL(input instanceof Request?input.url:input,SCOPE);
  u.searchParams.set('__pw_build',APP_VERSION+'-p'+CACHE_PROTOCOL);
  const response=await fetch(u,{cache:'no-store',credentials:'same-origin'});
  if(!response.ok)throw new Error('Fresh response '+response.status);
  return response;
}
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await Promise.all([...new Set(KEYS.values())].map(async u=>cache.put(u,await fresh(u))));
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    await Promise.all((await caches.keys()).filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message',event=>{
  if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({
    version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheName:CACHE_NAME,cacheProtocol:CACHE_PROTOCOL
  });
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(request.mode!=='navigate'&&!KEYS.has(url.pathname))return;
  const canonical=request.mode==='navigate'?SCOPE.href:KEYS.get(url.pathname);
  event.respondWith((async()=>{
    try{
      const response=await fresh(request);
      const cache=await caches.open(CACHE_NAME);await cache.put(canonical,response.clone());
      return response;
    }catch{
      return (await caches.match(canonical))||Response.error();
    }
  })());
});
