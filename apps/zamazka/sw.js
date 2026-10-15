const CACHE_PREFIX = 'zamazka-';
const CACHE_NAME = 'zamazka-v1.39.0';
const ART_CACHE = 'zamazka-artworks-v1.12.5';
const APP_VERSION = '1.39.0';
const RELEASE_DATE = '2026-10-15';
const CACHE_PROTOCOL = 2;
const RELEASE_NOTES = ["Финальные фазы выставки объединены в театральную музейную церемонию: протокол фишек, разоблачение и итоги.","Голоса появляются на картинах с анимацией, очки раскрываются по ведомости, первый участник получает отдельную музейную награду.","Три экрана адаптированы для мобильного браузера, PWA и оконного ПК. Правила, ставки и начисление очков не менялись."];
const LAST_RELEASE_NOTES = ["Сдача подтверждается сервером; незавершённая передача сохраняется и повторяется после разрыва соединения.","Повторный вход возвращает в комнату и незавершённую картину после перезагрузки страницы.","Ускорены мазки за счёт кэширования слоёв; добавлены плавный ввод, компактный холст, предпросмотр пипетки и спокойные уведомления."];
const PRIOR_RELEASE_NOTES = ["Куратор задаёт время реставрации перед запуском выставки: от 1 до 5 минут, шесть вариантов.","Выбранное время одинаковое у всех участников и сохраняется для каждого раунда; по умолчанию 2:40.","Изменение длительности не затрагивает просмотр картин, голосование и общую выставку."];
const PREVIOUS_TIMING_NOTES = ["Исправлена потеря рисунка после превышения лимита PocketNet: черновики и сдача передаются частями и применяются только целиком.","Точнее совпадают курсор и кисть; общий холст больше не растягивает координаты на ПК. Исправлена потеря ввода при сбое захвата указателя.","Alt + колесо меняет размер кисти, пробел надёжнее считывает цвет с картины, лимит рисунка расширен до 100 линий и 2000 точек."];
const EARLIER_RELEASE_NOTES = ["Время реставрации увеличено со 105 до 160 секунд как в онлайне, так и в тренировке.","При рисовании и просмотре картин показаны автор, год, художественная школа и проверенный город создания, где он известен.","Расширены исторические сведения обо всех 54 картинах; город музея не выдаётся за место создания."];
const RELEASE_NOTES_EARLIER = ["Незавершённые реставрации автоматически сохраняются на устройстве и в PocketNet после мазка и периодически каждые 10 секунд.","При завершении времени сервер использует последнюю сохранённую работу; за несколько секунд до конца приложение пытается сдать рисунок автоматически.","Зажатый пробел временно включает пипетку: цвет берётся при отпускании даже с нарисованного пользователем участка."];
const LEGACY_RELEASE_NOTES = ["После голосований открывается общая выставка всех реставраций с неограниченным временем просмотра.","Каждую работу можно открыть, увеличить, переместить и сравнить с подлинником.","Следующий раунд либо финальные результаты запускает только организатор комнаты."];
const RELEASE_NOTES_PREVIOUS = ["Точные штрихи без перестроения: длинные жесты сохраняют геометрию, доступен курсор диаметра кисти.","Новый лёгкий редактор с собственными SVG-иконками, точным пером и кнопкой рисования вторым пальцем."];
// Earlier changes are documented in the repository history.
const PREVIOUS_RELEASE_NOTES = ["Упростили этапы: на экране одна главная задача, меньше отвлекающих подписей и повторных объяснений.","Главная на телефоне помещается на одном экране, а список рисующих в ожидании раскрывается по желанию.","Защита от перекрытия интерфейса статус-баром iPhone: кнопки и окно Pocket ID доступны в Safari и приложении, добавлен нижний выход из меню.","Единый Pocket ID: нарисованный аватар из профиля теперь используется в игре.","Pocket Social: приглашения из комнаты ожидания друзьям с подтверждённым Pocket ID.","Заливка по контуру штрихов с гладкими пересечениями, не зависящая от прошлых заливок.","После сдачи работы остаётся собственный холст с ползунком сравнения, пока рисуют остальные.","Во время экспертизы пять полотен показаны вместе; среди них ровно одна реставрация."];
const APP_SHELL = [
  './',
  './index.html',
  './app.config.json',
  './styles.css',
  './gallery-theme.css',
  './atelier-shell.css',
  './gallery-motion.css',
  './desktop-layout.css',
  './restoration-17.css',
  './editor-polish.css',
  './brush-cursor.css',
  './viewport-fit.css',
  './finale.css',
  './experience.css',
  './responsive-scale.css',
  './round-review.css',
  './native-art.css',
  './adaptive-layout.css',
  './museum-finish.css',
  './appearance-switch.css',
  './museum-atelier-v2.css',
  './museum-afterhours-home.css',
  './mobile-focus.css',
  './appearance.js',
  './scenography.js',
  './round-review.js',
  './art-provenance.js',
  './legacy-artworks.js',
  './app.js',
  './finale-ui.js',
  './tab-guests.js',
  './room-code.js',
  './emblem.js',
  './cloud-sync.js',
  '../../shared/capabilities/cloud.js',
  './museum-motion.js',
  './museum-lighting.js',
  './museum-audio.js',
  './exhibition-director.js',
  './AUDIO.md',
  './commons-board.js',
  './artworks.js',
  './museum-catalog.js',
  './museum-playful.js',
  './editor.js',
  './brush-cursor.js',
  './fill-core.js',
  './storage.js',
  './draft-transfer.js',
  '../../shared/capabilities/net.js',
  '../../shared/capabilities/identity.js',
  '../../shared/capabilities/zamazka-achievements.js',
  '../../shared/capabilities/identity.css',
  '../../shared/pocket-social.css',
  '../../shared/pocket-social.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  '../../shared/mobile-runtime.css',
  '../../shared/mobile-runtime.js',
  '../../shared/pwa-utils.js',
  '../../shared/update-manager.css',
  '../../shared/update-manager.js',
  '../../shared/workshop-mode.css',
  '../../shared/workshop-mode.js',
  '../../shared/capabilities/motion.js',
  '../../shared/capabilities/storage.js',
  '../../shared/capabilities/transfer.js',
  '../../shared/capabilities/audio.js',
  '../../shared/capabilities/device.js',
  '../../shared/capabilities/diagnostics.js'
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
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME && key !== ART_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin === 'https://thumb.wikimedia.org' &&
      requestUrl.pathname.startsWith('/wikipedia/commons/thumb/')) {
    event.respondWith((async () => {
      const cache = await caches.open(ART_CACHE);
      const stored = await cache.match(event.request);
      if (stored) return stored;
      try {
        const response = await fetch(event.request);
        if (response.ok && response.type === 'cors') {
          await cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        return (await cache.match(event.request)) || Response.error();
      }
    })());
    return;
  }
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstFresh(event.request, SCOPE_URL.href, SCOPE_URL.href));
    return;
  }

  const canonicalUrl = SHELL_KEYS.get(requestUrl.pathname);
  if (!canonicalUrl) return;

  event.respondWith(networkFirstFresh(event.request, canonicalUrl, SCOPE_URL.href));
});
