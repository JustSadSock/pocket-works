const CACHE_PREFIX = 'blockies-';
const CACHE_NAME = 'blockies-v0.5.7';
const APP_VERSION = '0.5.7';
const RELEASE_DATE = '2026-10-24';
const CACHE_PROTOCOL = 2;
const RELEASE_NOTES = ["Серверное время и ввод: меньше лишних сетевых импульсов, пакетные команды с подтверждениями и мгновенный визуальный отклик.","Улучшена производительность: только изменившееся поле перерисовывается, сохранены старые серверные версии.","Защитные коридоры шахт: ранняя блокировка и ручное возвращение после очистки, без накопления очков.","Исправлены завершение раунда, минимум два игрока, проверка наград и локальная пауза при просмотре достижений.","Финальная UX-проверка: безопасная пауза на настройках, атомарное сохранение, отмена захвата клавиши и адаптация результатов.","Устойчивые сетевые комнаты: восстановление соединения и роли ведущего, следующий раунд без призрачных фигур, защита от устаревших пакетов и ручное переподключение.","Физичный отклик фигур, анимированное разрушение строк и комбо, обновлённые синтезированные звуки и отсутствие повторных эффектов в сетевой игре.","Единая панель персональных шахт, предпросмотры встроены в сетку игрового поля; цветные направляющие, отклик на ввод, закрывающаяся заслонка выбывшего игрока.","Вечерняя тёмная тема (автоматически либо вручную), расширенные комнаты и настройки, новый экран итогов и цельная панель зон появления.","Персональные цветные входы фигур 4×2 для каждого игрока, ник, следующая фигура и выбывание только при блокировке собственного входа.","Дебаг-меню на Backquote/Ё с просмотром экранов и состояния комнаты.","Вход в комнаты друзей по Pocket Social без кода, полные ссылки и правильное восстановление комнаты.","Девять достижений с наградами профиля за проверенные сервером сетевые партии; коллекция в меню Blockies.","Интерфейс полностью переработан: светлая оболочка, ясная навигация, новое поле и компактные счётчики.","Новая зона управления большими пальцами и касание/свайпы по игровому полю на телефонах и планшетах.","Общее поле для 2–4 игроков теперь занимает всю ширину телефона; панели перестраиваются для планшетов и альбомной ориентации.","Предпросмотр фигур, экраны комнаты, локальной игры, настройки, пауза и результаты сведены в единую систему."];
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.config.json",
  "./manifest.webmanifest",
  "./app.js",
  "./art-bible.json",
  "./game.js",
  "./board-effects.js",
  "./theme.js",
  "./solo-save.js",
  "./network.js",
  "./input-prediction.js",
  "./spawn-bays.js",
  "./achievements.js",
  "../../shared/capabilities/blockies-achievements.js",
  "./styles.css",
  "./sw.js",
  "./visual-direction.json",
  "./icons/icon.svg",
  "./icons/source.svg",
  "../../shared/mobile-runtime.css",
  "../../shared/mobile-runtime.js",
  "../../shared/update-manager.js",
  "../../shared/update-manager.css",
  "../../shared/capabilities/net.js"
];

const SCOPE_URL = new URL('./', self.registration.scope);
const BUILD_TOKEN = `${APP_VERSION}-p${CACHE_PROTOCOL}`;
const SHELL_KEYS = new Map(
  APP_SHELL.map((entry) => {
    const url = new URL(entry, SCOPE_URL);
    return [url.pathname, url.href];
  })
);

function buildNetworkUrl(input) {
  const url = new URL(input instanceof Request ? input.url : input, SCOPE_URL);
  url.searchParams.set('__pw_build', BUILD_TOKEN);
  return url;
}

async function fetchFresh(input) {
  const response = await fetch(buildNetworkUrl(input), {
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'follow'
  });

  if (!response || !response.ok) {
    throw new Error(`Fresh application request failed: ${response?.status || 'network'}`);
  }

  return response;
}

async function precacheFreshShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    [...new Set(SHELL_KEYS.values())].map(async (canonicalUrl) => {
      const response = await fetchFresh(canonicalUrl);
      await cache.put(canonicalUrl, response);
    })
  );
}

async function networkFirstFresh(request, canonicalUrl, fallbackUrl = canonicalUrl) {
  try {
    const response = await fetchFresh(request);
    const cache = await caches.open(CACHE_NAME);
    await cache.put(canonicalUrl, response.clone());
    return response;
  } catch {
    return caches.match(canonicalUrl).then((cached) => cached || caches.match(fallbackUrl));
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheFreshShell());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') {
    event.ports?.[0]?.postMessage({
      version: APP_VERSION,
      releaseDate: RELEASE_DATE,
      releaseNotes: RELEASE_NOTES,
      cacheProtocol: CACHE_PROTOCOL,
      cacheName: CACHE_NAME
    });
  }

  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstFresh(event.request, SCOPE_URL.href, SCOPE_URL.href));
    return;
  }

  const canonicalUrl = SHELL_KEYS.get(requestUrl.pathname);
  if (!canonicalUrl) return;

  event.respondWith(networkFirstFresh(event.request, canonicalUrl, SCOPE_URL.href));
});
