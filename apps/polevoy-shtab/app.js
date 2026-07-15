import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  COLS, ROWS, DOCTRINES, TERRAIN, WEATHER, UNIT_TYPES, UPGRADES,
  attackableUnits, attackUnit, campaignRank, chooseEnemyAction, clamp,
  completeDefeat, completeVictory, createCampaign, entrenchUnit, evaluateBattle,
  executeEnemyAction, finishRound, generateBattle, getTerrain, getUnit, getUnitAt,
  getUpgradeChoices, hashSeed, manhattan, moveUnit, rallyUnit, reachableCells,
  resupplyUnit, seededRandom, summarizeUnit, useDoctrine, visibleEnemyIds,
  beginEnemyPhase,
} from './game-core.js';

const WORKSHOP_CONFIG = {
  cachePrefix: 'polevoy-shtab-',
  storageNamespace: 'pocket-works:polevoy-shtab'
};
const SHELL_PARTS = [
  './shell/part-01.html',
  './shell/part-02.html'
];
const STYLE_PARTS = [
  './styles/part-01.css',
  './styles/part-02.css',
  './styles/part-03.css'
];
const APP_PARTS = [
  './runtime/app-01.txt',
  './runtime/app-02.txt',
  './runtime/app-03.txt',
  './runtime/app-04.txt',
  './runtime/app-05.txt',
  './runtime/app-06.txt',
  './runtime/app-07.txt'
];

async function loadText(path) {
  const response = await fetch(new URL(path, import.meta.url), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Не удалось загрузить ${path}: ${response.status}`);
  return response.text();
}

async function boot() {
  installMobileRuntime();
  const [shell, css, runtime] = await Promise.all([
    Promise.all(SHELL_PARTS.map(loadText)).then((parts) => parts.join('')),
    Promise.all(STYLE_PARTS.map(loadText)).then((parts) => parts.join('')),
    Promise.all(APP_PARTS.map(loadText)).then((parts) => parts.join('')),
  ]);
  const style = document.createElement('style');
  style.dataset.appStyles = 'polevoy-shtab';
  style.textContent = css;
  document.head.append(style);
  const app = document.querySelector('#app');
  app.innerHTML = shell;
  globalThis.__POLEVOY_DEPS = {
    installMobileRuntime, createWorkshopMode, watchConnectivity,
    COLS, ROWS, DOCTRINES, TERRAIN, WEATHER, UNIT_TYPES, UPGRADES,
    attackableUnits, attackUnit, campaignRank, chooseEnemyAction, clamp,
    completeDefeat, completeVictory, createCampaign, entrenchUnit, evaluateBattle,
    executeEnemyAction, finishRound, generateBattle, getTerrain, getUnit, getUnitAt,
    getUpgradeChoices, hashSeed, manhattan, moveUnit, rallyUnit, reachableCells,
    resupplyUnit, seededRandom, summarizeUnit, useDoctrine, visibleEnemyIds,
    beginEnemyPhase, WORKSHOP_CONFIG,
  };
  const prelude = `const { installMobileRuntime, createWorkshopMode, watchConnectivity, COLS, ROWS, DOCTRINES, TERRAIN, WEATHER, UNIT_TYPES, UPGRADES, attackableUnits, attackUnit, campaignRank, chooseEnemyAction, clamp, completeDefeat, completeVictory, createCampaign, entrenchUnit, evaluateBattle, executeEnemyAction, finishRound, generateBattle, getTerrain, getUnit, getUnitAt, getUpgradeChoices, hashSeed, manhattan, moveUnit, rallyUnit, reachableCells, resupplyUnit, seededRandom, summarizeUnit, useDoctrine, visibleEnemyIds, beginEnemyPhase } = globalThis.__POLEVOY_DEPS;\n`;
  const blobUrl = URL.createObjectURL(new Blob([prelude, runtime, '\n//# sourceURL=polevoy-shtab-runtime.js'], { type: 'text/javascript' }));
  try { await import(blobUrl); } finally { URL.revokeObjectURL(blobUrl); delete globalThis.__POLEVOY_DEPS; }
}

boot().catch((error) => {
  console.error('ПОЛЕВОЙ ШТАБ: ошибка запуска', error);
  const boot = document.querySelector('#bootStatus');
  if (boot) boot.textContent = 'Карта не развернулась. Перезагрузите приложение.';
  const retry = document.querySelector('#bootRetry');
  if (retry) retry.hidden = false;
});
