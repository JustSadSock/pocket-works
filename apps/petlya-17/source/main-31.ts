import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { RaceGame } from './race-game';

const version = '3.1.1';
const appName = 'ПЕТЛЯ 17';
const namespace = 'pocket-works:petlya-17';

installMobileRuntime();
registerEnhancedUpdate({
  appName,
  version,
  releaseNotes: [
    'Исправлена остановка загрузки на этапе сборки банков и геометрии кольца в iOS WebKit.',
    'Процедурная фактура асфальта теперь имеет безопасный резервный материал, если 2D Canvas-контекст недоступен.',
    'Декоративные блоки мира изолированы: ошибка одного элемента больше не блокирует всю трассу.',
    'Добавлен резервный контур и явная диагностика вместо бесконечной полосы загрузки.'
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
    if (loadingText) {
      const details = error instanceof Error ? error.message : String(error);
      loadingText.textContent = `Перезапусти приложение · ${details.slice(0, 90)}`;
    }
    document.documentElement.dataset.bootError = error instanceof Error ? error.message : String(error);
  });
}