import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { RaceGame } from './race-game';

const version = '3.2.1';
const appName = 'ПЕТЛЯ 17';
const namespace = 'pocket-works:petlya-17';

installMobileRuntime();
registerEnhancedUpdate({
  appName,
  version,
  releaseNotes: [
    'Исправлен сбой загрузки VertexData is not defined при создании 3D-кузовов.',
    'Перед выпуском теперь выполняется строгая проверка TypeScript.',
    'Пересобран прибрежный автодром: дорожное полотно, разметка, поребрики, ограждения и порт.',
    'Болиды и кокпит детализированы, освобождён обзор трассы.',
    'Новая кинематографичная камера меню, карта и подсказки к поворотам.',
    'Загрузка завершается по готовности двух отрисованных кадров.'
  ]
});

const canvas = document.querySelector<HTMLCanvasElement>('#renderCanvas');
if (canvas) {
  const game = new RaceGame(canvas);
  createWorkshopMode({
    appName,
    version,
    cachePrefix: 'petlya-17-',
    storageNamespace: namespace,
    onReset: () => game.resetAll()
  });
  void game.boot().catch((error: unknown) => {
    console.error('[ПЕТЛЯ 17] Критическая ошибка загрузки.', error);
    const loadingBar = document.querySelector<HTMLElement>('#loadingBar');
    const loadingText = document.querySelector<HTMLElement>('#loadingText');
    const loadingTitle = document.querySelector<HTMLElement>('#loading h1');
    if (loadingBar) loadingBar.style.width = '100%';
    if (loadingTitle) loadingTitle.textContent = 'СБОЙ СБОРКИ';
    const retry = document.querySelector<HTMLButtonElement>('#retryBoot');
    if (retry) {
      retry.classList.remove('hidden');
      retry.addEventListener('click', () => window.location.reload(), { once: true });
    }
    if (loadingText) {
      const details = error instanceof Error ? error.message : String(error);
      loadingText.textContent = `Перезапусти приложение · ${details.slice(0, 90)}`;
    }
    document.documentElement.dataset.bootError = error instanceof Error ? error.message : String(error);
  });
}