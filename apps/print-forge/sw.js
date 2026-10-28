const CACHE_PREFIX = 'print-forge-';
const CACHE_NAME = 'print-forge-v1.0.0-p1';
const APP_VERSION = '1.0.0';
const RELEASE_DATE = '2026-10-28';
const CACHE_PROTOCOL = 1;
const RELEASE_NOTES = [
  'Параметрические шестерни, корпус-лоток и втулка с экспортом STL.',
  'Интерактивный кинематический стенд с передачей вращения и реверсом.',
  'Локальная проверка замкнутой поверхности, импорт и экспорт CAD-заданий.'
];
const APP_SHELL = [
  './','./index.html','./styles.css','./app.js','./geometry.js',
  './app.config.json','./manifest.webmanifest','./icons/icon.svg',
  '../../shared/mobile-runtime.css','../../shared/mobile-runtime.js',
  '../../shared/update-manager.css','../../shared/update-manager.js',
  '../../shared/workshop-mode.css','../../shared/workshop-mode.js',
  '../../shared/capabilities/motion.js','../../shared/capabilities/storage.js',
  '../../shared/capabilities/transfer.js','../../shared/capabilities/audio.js',
  '../../shared/capabilities/device.js','../../shared/capabilities/diagnostics.js'
];
const SCOPE_URL = new URL('./', self.registration.scope);
const BUILD_TOKEN = APP_VERSION + '-p' + CACHE_PROTOCOL;
const SHELL_KEYS = new Map(APP_SHELL.map(p => {const url=new URL(p,SCOPE_URL);return [url.pathname,url.href]}));
function freshUrl(input) {const url=new URL(input instanceof Request?input.url:input,SCOPE_URL);url.searchParams.set('__pw_build',BUILD_TOKEN);return url}
async function fetchFresh(input) {const r=await fetch(freshUrl(input),{cache:'no-store',credentials:'same-origin',redirect:'follow'});if(!r.ok)throw Error('Fetch failed: '+r.status);return r}
async function preCache() {const cache=await caches.open(CACHE_NAME);await Promise.all([...new Set(SHELL_KEYS.values())].map(async u=>cache.put(u,await fetchFresh(u))))}
async function networkFirst(request,canonical,fallback=canonical) {try{const response=await fetchFresh(request),cache=await caches.open(CACHE_NAME);await cache.put(canonical,response.clone());return response}catch{return await caches.match(canonical)||await caches.match(fallback)||Response.error()}}
self.addEventListener('install',event=>event.waitUntil(preCache()));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{
  if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME});
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){event.respondWith(networkFirst(event.request,SCOPE_URL.href,SCOPE_URL.href));return}
  const canonical=SHELL_KEYS.get(url.pathname);
  if(canonical)event.respondWith(networkFirst(event.request,canonical,SCOPE_URL.href));
});
