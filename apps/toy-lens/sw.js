const RELEASE_NOTES = ["Tilt-shift движок перестроен: вместо одного равномерного размытого слоя используется многоступенчатая глубина — слабое, среднее и сильное размытие нарастают по мере удаления от фокуса.","Добавлен режим «Объект» с перетаскиваемой эллиптической зоной резкости для людей, еды, предметов и кадров сверху; режим «Сцена» сохранён для улиц, комнат и пейзажей.","Резкая область теперь дополнительно усиливает локальный контраст и насыщенность, поэтому объект визуально отделяется от окружения и кадр меньше похож на простое замыливание.","Предпросмотр на телефонах стал легче: снижено внутреннее рабочее разрешение видео, обработка слайдеров ограничена одним кадром анимации, а статические фото кешируют готовые уровни blur.","Сильный профиль миниатюры обновлён: более выраженная цветопередача, контраст, виньетка и глубина по умолчанию.","Экспорт фото и видео использует тот же новый движок глубины, что и предпросмотр."];
const RELEASE_DATE = "2026-09-07";
const APP_VERSION = "1.1.0";
const CACHE_NAME = 'toy-lens-v1.1.0';
const CACHE_PREFIX = "toy-lens-";
const APP_SHELL = ["../../shared/update-manager.js","../../shared/update-manager.css","../../shared/pwa-utils.js",
  './',
  './index.html',
  './styles.css',
  './canvas-filter-polyfill.js',
  './app-v2.js',
  './manifest.webmanifest',
  './icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }))
  );
});

self.addEventListener('message',event=>{if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:APP_VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES,cacheProtocol:1,cacheName:"toy-lens-v1.1.0"});if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
