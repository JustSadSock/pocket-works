import './styles.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'COLOSSUS // INSIDE';
const version = '1.3.0';
const storageNamespace = 'pocket-works:colossus-inside';
const releaseNotes = [
  'Переписана traversal-физика: визуальные разрывы между бронепластинами теперь реальные и требуют прыжков, а падение возвращает к последней устойчивой опоре.',
  'Инерция больше не считается из собственной ходьбы игрока: движение колосса передаётся отдельно, а корпус персонажа компенсирует наклон и ускорение платформы.',
  'Плечевой шарнир получил крупный мировой маяк, экранный указатель и усиленный локальный свет; вдоль маршрута добавлено рабочее сервисное освещение.',
  'Добавлен диагностический state bridge для Playwright и отдельные детерминированные тесты прыжка, разрывов, опор и climb-якорей.',
  'По реальным Chromium/WebKit-скриншотам поднята читаемость брони: добавлены мобильный sky-fill, тёплый rim-light, camera fill и минимальный material ambient/emissive lift без пересвета.'
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({
  appName,
  version,
  cachePrefix: 'colossus-inside-',
  storageNamespace,
  onReset: () => location.reload()
});

void (async () => {
  await import('./game-v3.js');
  const { installColossusVisualTuning } = await import('./visual-tuning.js');
  installColossusVisualTuning();
})();
