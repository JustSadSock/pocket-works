const RELEASE_NOTES=["Сила гравитации нарастает при удержании; чем дольше владеете шаром, тем мощнее ответный перехват соперника.","На аренах «Рикошет» и «Маятник» появились кинетические ускорители, формирующие связки с отражателями.","Новый визуальный индикатор перегрузки, звуки отражателей и ускорителей, тактические решения ИИ."];
const PREFIX = "tyaga-duel-";
const CACHE = "tyaga-duel-v1.1.0";
const FILES = ["./","./index.html","./app.config.json","./app.js","./physics.js","./styles.css","./manifest.webmanifest","./icons/icon.svg","../../shared/mobile-runtime.css","../../shared/mobile-runtime.js","../../shared/update-manager.css","../../shared/update-manager.js","../../shared/workshop-mode.css","../../shared/workshop-mode.js"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)))).then(() => self.clients.claim()));
});
self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "GET_UPDATE_INFO") event.ports?.[0]?.postMessage({version:"1.1.0",releaseDate:"2026-10-18",releaseNotes:RELEASE_NOTES,cacheName:CACHE,cacheProtocol:2});
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL("./", self.registration.scope);
  const known = new Set(FILES.map(path => new URL(path, scope).pathname));
  if (event.request.mode === "navigate" && url.pathname.startsWith(scope.pathname)) {
    event.respondWith(fetch(event.request).catch(() => caches.match("./"))); return;
  }
  if (!known.has(url.pathname)) return;
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(resp => {
    if (resp.ok && resp.type !== "opaque") caches.open(CACHE).then(cache => cache.put(event.request,resp.clone()));
    return resp;
  })));
});