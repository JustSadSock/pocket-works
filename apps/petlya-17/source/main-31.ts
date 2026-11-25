import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { RaceGame } from './race-game';

const version = '3.2.2';
const appName = 'ПЕТЛЯ 17';
const namespace = 'pocket-works:petlya-17';

installMobileRuntime();
registerEnhancedUpdate({
  appName,
  version,
  releaseNotes: ["Ускорение, руление и гоночный таймер сохраняют игровой темп при снижении частоты кадров.","Автоматическое качество графики учитывает фактическую частоту кадров.","Добавлены регрессионные проверки физики при 4–120 FPS и длительных паузах."]
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