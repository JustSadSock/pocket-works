const CACHE_PREFIX = 'flagpost-';
const CACHE_NAME = 'flagpost-v1.0.0';
const APP_VERSION = '1.0.0';
const RELEASE_DATE = '2026-10-12';
const CACHE_PROTOCOL = 2;
const RELEASE_NOTES = [
  'Настоящая сетевая стратегия на двоих через Cloudflare Durable Objects.',
  'Короткий восьмизначный код для входа и прямые ссылки-приглашения.',
  'Отряды, два приказа, центральная башня, подкрепления и серверное определение победителя.'
];
const APP_SHELL = [
  './','./index.html','./app.config.json','./styles.css','./app.js',
  './manifest.webmanifest','./icons/icon.svg',
  '../../shared/mobile-runtime.css','../../shared/mobile-runtime.js',
  '../../shared/pwa-utils.js','../../shared/update-manager.css',
  '../../shared/update-manager.js','../../shared/workshop-mode.css',
  '../../shared/workshop-mode.js','../../shared/capabilities/net.js',
  '../../shared/capabilities/storage.js','../../shared/capabilities/transfer.js',
  '../../shared/capabilities/diagnostics.js'
];
const SCOPE = new URL('./', self.registration.scope);
const SHELL = new Map(APP_SHELL.map(path => { const url = new URL(path,SCOPE); return [url.pathname,url.href]; }));
const token = APP_VERSION + '-p' + CACHE_PROTOCOL;
async function fresh(input) {
  const url = new URL(input instanceof Request ? input.url : input, SCOPE);
  url.searchParams.set('__pw_build',token);
  const response = await fetch(url, { cache:'no-store', credentials:'same-origin', redirect:'follow' });
  if (!response.ok) throw Error('Unable to update shell: ' + response.status);
  return response;
}
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all([...new Set(SHELL.values())].map(async url => cache.put(url, await fresh(url))));
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  await Promise.all((await caches.keys()).filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('message', event => {
  if (event.data?.type === 'GET_UPDATE_INFO') event.ports?.[0]?.postMessage({
    version:APP_VERSION, releaseDate:RELEASE_DATE, releaseNotes:RELEASE_NOTES, cacheProtocol:CACHE_PROTOCOL,cacheName:CACHE_NAME
  });
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/pocketnet/')) return;
  if (event.request.mode !== 'navigate' && !SHELL.has(url.pathname)) return;
  const fallback = event.request.mode === 'navigate' ? SCOPE.href : SHELL.get(url.pathname);
  event.respondWith((async () => {
    try {
      const response = await fresh(event.request);
      const cache = await caches.open(CACHE_NAME);
      await cache.put(fallback,response.clone());
      return response;
    } catch { return (await caches.match(fallback)) || Response.error(); }
  })());
});
