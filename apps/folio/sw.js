const CACHE_PREFIX = 'folio-';
const CACHE_NAME = 'folio-v1.6.0';
const APP_VERSION = '1.6.0';
const RELEASE_DATE = '2026-10-18';
const RELEASE_NOTES = ["Защищённая верхняя область на iPhone: элементы управления не перекрываются системной строкой в Safari и установленном приложении.","Заливка теперь ориентируется только на реальные контуры, а не на ранее закрашенные участки: можно свободно перекрашивать области, пересечения линий аккуратно закрываются.","Быстрые штрихи больше не обрываются до точки отпускания: сглаживание подстраивается под скорость движения, последние координаты учитываются, рисунок не превращается неожиданно в прямую линию.","На ПК курсор показывает реальный круг размера кисти и ластика с учётом масштаба, включая обычный ввод мышью и графическим пером.","Pocket Cloud: защищённая синхронизация многослойных рисунков через Pocket ID, сохранение конфликтующих версий и удалений."];
const CACHE_PROTOCOL = 3;
const APP_SHELL = ['./','./index.html','./styles.css','./app.js','./cloud-sync.js','./collab.js','./fill-engine.mjs','./app.config.json','./manifest.webmanifest','./icons/icon.svg',
  '../../shared/mobile-runtime.css','../../shared/mobile-runtime.js',
  '../../shared/update-manager.css','../../shared/update-manager.js',
  '../../shared/workshop-mode.css','../../shared/workshop-mode.js',
  '../../shared/pwa-utils.js','../../shared/capabilities/motion.js',
  '../../shared/capabilities/storage.js','../../shared/capabilities/transfer.js',
  '../../shared/capabilities/net.js','../../shared/capabilities/audio.js','../../shared/capabilities/device.js','../../shared/capabilities/diagnostics.js','../../shared/capabilities/cloud.js','../../shared/capabilities/identity.js'];
const SCOPE_URL = new URL('./', self.registration.scope);
const BUILD_TOKEN = APP_VERSION + '-p' + CACHE_PROTOCOL;
const FILES = new Map(APP_SHELL.map(entry => {
  const u = new URL(entry, SCOPE_URL);
  return [u.pathname, u.href];
}));
async function getFresh(input) {
  const url = new URL(input instanceof Request ? input.url : input, SCOPE_URL);
  url.searchParams.set('__pw_build', BUILD_TOKEN);
  const response = await fetch(url, {cache:'no-store', credentials:'same-origin', redirect:'follow'});
  if (!response.ok) throw Error('Network unavailable');
  return response;
}
async function precache() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all([...new Set(FILES.values())].map(async url => cache.put(url, await getFresh(url))));
}
self.addEventListener('install', e => e.waitUntil(precache()));
self.addEventListener('message', event => {
  if (event.data?.type === 'GET_UPDATE_INFO') event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME});
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.origin!==self.location.origin)return;
  if(e.request.mode==='navigate'){
    e.respondWith(getFresh(e.request).then(async response=>{
      (await caches.open(CACHE_NAME)).put(SCOPE_URL.href,response.clone());return response;
    }).catch(()=>caches.match(SCOPE_URL.href)));
    return;
  }
  const key=FILES.get(url.pathname);
  if(!key)return;
  e.respondWith(getFresh(e.request).then(async response=>{
    (await caches.open(CACHE_NAME)).put(key,response.clone());return response;
  }).catch(()=>caches.match(key)));
});
