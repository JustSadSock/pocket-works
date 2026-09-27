const APP_VERSION = "1.1.1";
const RELEASE_DATE = "2026-09-27";
const RELEASE_NOTES = ["Форсировано обновление мобильного Web-релиза и новый cache namespace, чтобы устройства не продолжали запускать старый Godot export.","Панель ресурсов опущена ниже iOS Dynamic Island и дополнена видимой меткой версии v1.1.1.","После решения больше нет отдельной почти чёрной плашки: итог и изменения ресурсов остаются в карточке посетителя.","Смена времени суток теперь плавная, а конец дня больше не проваливает сцену одним кадром почти в чёрный.","Сохранены механический рычаг, переработанные тексты событий, детализация мира, ambience и улучшенные анимации из релиза 1.1."];
const CACHE_NAME = "zastava-v1.1.1";
const CACHE_PREFIX = "zastava-";
const FILES = [
  "./icons/icon.svg",
  "./index.apple-touch-icon.png",
  "./index.audio.position.worklet.js",
  "./index.audio.worklet.js",
  "./index.html",
  "./index.icon.png",
  "./index.js",
  "./index.pck",
  "./index.png",
  "./index.wasm",
  "./manifest.webmanifest",
  "./pocketworks-build.json",
  "../../shared/release-guard.js"
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(FILES.map((file) => cache.add(new Request(file, { cache: 'reload' }))));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') event.ports?.[0]?.postMessage({ version: APP_VERSION, releaseDate: RELEASE_DATE, releaseNotes: RELEASE_NOTES, cacheName: CACHE_NAME });
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok && url.pathname.startsWith(new URL(self.registration.scope).pathname)) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, response.clone()).catch(() => {});
      }
      return response;
    } catch (error) {
      if (event.request.mode === 'navigate') return (await caches.match('./index.html')) || Response.error();
      throw error;
    }
  })());
});
