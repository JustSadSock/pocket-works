const CACHE_PREFIX = "pocket-works-vektor-";
const CACHE_NAME = `${CACHE_PREFIX}v1.0.0`;
const APP_SHELL = [
  "./", "./index.html", "./styles.css", "./app.js", "./engine.js", "./ai-worker.js",
  "./manifest.webmanifest", "./icons/icon.svg",
  "../../shared/mobile-runtime.css", "../../shared/update-manager.css", "../../shared/update-manager.js"
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (!response || response.status !== 200 || response.type === "opaque") return response;
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match("./index.html"))));
});
