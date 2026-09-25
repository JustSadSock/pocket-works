/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string }> };

const CACHE_PREFIX = 'melt-crypt-';
const CACHE_NAME = 'melt-crypt-v2.0.0';
const APP_VERSION = '2.0.0';
const RELEASE_DATE = '2026-09-25';
const RELEASE_NOTES = [
  "Полностью заменён старый генератор мобов на читаемую модульную грамматику: 6 тел, 5 locomotion-пакетов, 8 arm/weapon-модулей, 6 защит и 8 видимых мутаций; последние 30 enemy signatures защищены от близких повторов.",
  "Стрельба заменена мобильной melee-системой ATTACK / DODGE / WEAPON SKILL: tap/hold атаки, weapon-specific reach/arc/cadence/recovery/combo, dash attacks, мягкий aim assist, parry/ward/hook/projectile/AoE/phase cut/execution/pulse.",
  "Добавлен генератор оружия из 6 cores, 10 рабочих голов и 8 skills: длина, масса, крюк, guard, glowing core, trait и skill видны на модели и реально меняют правила боя; сундуки и часть врагов создают новые weapon signatures.",
  "Игрок переведён на swept capsule-controller со step-height и auto-sprint; dodge и skills больше не туннелят сквозь стены. Добавлены hit-stop, event camera impulse, stagger, knockback, blood FX и читаемые weak points/armor.",
  "Мир зафиксирован в одной тёмно-красной эстетике и получил 18 архитектурных room modules. Roguelike-реликвии и meta-прогрессия теперь в первую очередь открывают новые механики и расширяют словарь генераторов, а не раздают процентные статы."
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
