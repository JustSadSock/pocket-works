const BUILD='5.4.1';
const RELEASE_DATE='2026-07-18';
const CACHE_NAME='blazon-v5.4.1';
const CACHE=CACHE_NAME;
const FINGERPRINT=new URL(self.location.href).searchParams.get('pw_fp')||'';
const REQUIRED=[
  './','./index.html','./styles.css','./living-battle.css',
  './app.js','./bootstrap.js','./engine.js','./core-engine.js','./progression-engine.js','./combat-clarity.js','./heraldry.js',
  './manifest.webmanifest','./icons/icon.svg',
  '../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/update-manager.css',
  '../../shared/workshop-mode.css','../../shared/workshop-mode.js','../../shared/pwa-utils.js',
  '../../shared/capabilities/storage.js','../../shared/capabilities/diagnostics.js','../../shared/capabilities/device.js','../../shared/capabilities/transfer.js'
];
const OPTIONAL=[
  './armorial-progression.css','./armorial-composition.css','./critical-readability.js','./progression-art.js',
  './progression-runtime.js','./armorial-composition-runtime.js','./release-indicator.js','./reset.html'
];
const RELEASE_NOTES=[
  'Устранён бесконечный цикл между двумя декоративными наблюдателями, из-за которого главный поток переставал обрабатывать любые нажатия.',
  'Геральдические улучшения теперь следят только за собственными контейнерами и обновляются не чаще одного кадра.',
  'Декоративные модули больше не переписывают футер и не способны будить друг друга через DOM-мутации.',
  'Основные кнопки и ссылка возврата получают приоритетный интерактивный слой ещё до запуска игрового движка.',
  'Загрузка улучшений выполняется последовательно между кадрами, не блокируя готовое меню.'
];

async function fetchRelease(path,timeout=12000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const url=new URL(path,self.registration.scope);
    url.searchParams.set('pw_release',BUILD);
    if(FINGERPRINT)url.searchParams.set('pw_fp',FINGERPRINT);
    const response=await fetch(url,{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error(`${path}: HTTP ${response.status}`);
    return response;
  }finally{
    clearTimeout(timer);
  }
}

async function put(cache,path){
  const response=await fetchRelease(path);
  await cache.put(path,response);
}

self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await Promise.all(REQUIRED.map(path=>put(cache,path)));
  await Promise.allSettled(OPTIONAL.map(path=>put(cache,path)));
  await self.skipWaiting();
})()));

self.addEventListener('message',event=>{
  if(event.data?.type==='GET_UPDATE_INFO'){
    event.ports?.[0]?.postMessage({
      version:BUILD,
      fingerprint:FINGERPRINT,
      releaseDate:RELEASE_DATE,
      releaseNotes:RELEASE_NOTES,
      cacheName:CACHE,
      cacheProtocol:5
    });
  }
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});

self.addEventListener('activate',event=>event.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>key.startsWith('blazon-')&&key!==CACHE).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim())
));

async function networkFirst(request,fallback='./index.html'){
  try{
    const response=await fetch(new Request(request,{cache:'no-store'}));
    if(response.ok){
      const cache=await caches.open(CACHE);
      cache.put(request,response.clone()).catch(()=>{});
      return response;
    }
  }catch{}
  return(await caches.match(request,{ignoreSearch:true}))||(await caches.match(fallback,{ignoreSearch:true}))||Response.error();
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(networkFirst(event.request,'./index.html'));
    return;
  }
  if(['script','style','worker','manifest'].includes(event.request.destination)||/\.(?:js|css|webmanifest|json)$/i.test(url.pathname)){
    event.respondWith(networkFirst(event.request));
    return;
  }
  event.respondWith(caches.match(event.request,{ignoreSearch:true}).then(hit=>hit||networkFirst(event.request)));
});
