/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'melt-crypt-';
const CACHE_NAME = 'melt-crypt-v3.0.0';
const APP_VERSION = '3.0.0';
const RELEASE_DATE = '2026-09-26';
const RELEASE_NOTES = [
  "Combat Rebuild: стартовый GRAVE CLEAVER теперь фиксированный и вручную настроенный; все шесть weapon cores получили отдельные attack motion packages с anticipation, impact, follow-through и ограничением обычного удара до отзывчивого диапазона.",
  "Враги получили locomotion/attack/stagger/death-анимации, телеграфы и несколько типов смерти; encounter director закрывает комнату, выпускает противников волнами и открывает её после зачистки.",
  "Первая боевая комната гарантированно предлагает три разных оружия, каждый сундук тоже даёт выбор из трёх, а шанс обычного weapon drop повышен; лежащее оружие отмечено заметным beacon и показывает сравнение SPD/RNG/STG до поднятия.",
  "Перестроены game feel и звук: многослойные swing/impact/armor/parry/stagger/death SFX, combat pulse, шаги, более сильный event-only camera impulse, hit-stop, knockback, blood FX и execution payoff.",
  "HUD и изображение очищены: системные signatures/grammar скрыты из боя, карта гаснет во время encounter, уменьшены saturation/contrast/emissive, враги отделены по яркости от окружения; крипта расширена до 26 authored room modules без новых биомов."
];

setCacheNameDetails({ prefix: 'melt-crypt', suffix: `v${APP_VERSION}`, precache: 'precache', runtime: 'runtime' });
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_UPDATE_INFO') {
    event.ports?.[0]?.postMessage({ version: APP_VERSION, releaseDate: RELEASE_DATE, releaseNotes: RELEASE_NOTES });
  }
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && !key.includes(`v${APP_VERSION}`) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => clientsClaim())
  );
});
