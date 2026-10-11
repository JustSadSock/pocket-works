const CACHE_PREFIX = 'klyatvy-';
const CACHE_NAME = 'klyatvy-v1.0.0';
const APP_VERSION = '1.0.0';
const RELEASE_DATE = '2026-10-11';
const RELEASE_NOTES = [
  "Первая кампания: двенадцать владений, семь вассальных домов и независимые марки.",
  "Грамоты с условиями, восковыми печатями, отказами и исторической памятью договоров.",
  "Сезонная политическая симуляция: казна, армия, престиж, мятежи, реформы и автономная карта.",
  "Авторская нарисованная карта, отзывчивый мобильный интерфейс, автосохранение и офлайн-доступ."
];
const CACHE_PROTOCOL = 2;
const APP_SHELL = ['./','./index.html','./app.js','./engine.js','./world.js','./styles.css','./manifest.webmanifest','./app.config.json','./icons/icon.svg','../../shared/mobile-runtime.css','../../shared/mobile-runtime.js','../../shared/update-manager.css','../../shared/update-manager.js','../../shared/capabilities/motion.js','../../shared/capabilities/storage.js','../../shared/capabilities/transfer.js','../../shared/capabilities/audio.js','../../shared/capabilities/device.js','../../shared/capabilities/diagnostics.js','../../shared/workshop-mode.js','../../shared/workshop-mode.css'];
const SCOPE_URL = new URL('./', self.registration.scope);
const BUILD_TOKEN = APP_VERSION + '-p' + CACHE_PROTOCOL;
const SHELL_KEYS = new Map(APP_SHELL.map(entry => { const url = new URL(entry, SCOPE_URL); return [url.pathname, url.href]; }));
function freshUrl(input) { const url = new URL(input instanceof Request ? input.url : input, SCOPE_URL); url.searchParams.set('__pw_build', BUILD_TOKEN); return url; }
async function fetchFresh(input) { const response = await fetch(freshUrl(input), { cache:'no-store', credentials:'same-origin' }); if(!response.ok) throw Error('Failed loading required file: '+response.status); return response; }
async function precache() { const cache = await caches.open(CACHE_NAME); await Promise.all([...new Set(SHELL_KEYS.values())].map(async url => cache.put(url, await fetchFresh(url)))); }
self.addEventListener('install', event => event.waitUntil(precache()));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('message', event => {
 if(event.data?.type === 'SKIP_WAITING') self.skipWaiting();
 if(event.data?.type === 'GET_UPDATE_INFO') event.ports?.[0]?.postMessage({ version:APP_VERSION, releaseDate:RELEASE_DATE, releaseNotes:RELEASE_NOTES, cacheProtocol:CACHE_PROTOCOL, cacheName:CACHE_NAME });
});
async function networkFirst(request, key) {
 try { const response = await fetchFresh(request); (await caches.open(CACHE_NAME)).put(key, response.clone()); return response; }
 catch { return (await caches.match(key)) || (await caches.match(SCOPE_URL.href)) || Response.error(); }
}
self.addEventListener('fetch', event => {
 if(event.request.method !== 'GET') return;
 const url = new URL(event.request.url);
 if(url.origin !== self.location.origin) return;
 if(event.request.mode === 'navigate') { event.respondWith(networkFirst(event.request, SCOPE_URL.href)); return; }
 const canonical = SHELL_KEYS.get(url.pathname);
 if(canonical) event.respondWith(networkFirst(event.request, canonical));
});
