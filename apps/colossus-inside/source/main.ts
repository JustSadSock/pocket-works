import './styles.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'COLOSSUS // INSIDE';
const version = '1.4.0';
const storageNamespace = 'pocket-works:colossus-inside';
const releaseNotes = [
  'Перестроена визуальная читаемость внутренностей: вместо линий в пустоте появились пол, силовой каркас, поперечные рёбра, мембраны и локальные сервисные огни.',
  'Маршрутные полосы превращены из яркой сетки в тонкие металлические инкрустации, встроенные в геометрию опор.',
  'Освещение и туман теперь отдельно настраиваются для внешней поверхности и thoracic core, поэтому глубина не исчезает в чёрном фоне.',
  'Сохранена физика 1.3: реальные разрывы, прыжок, падение, checkpoint recovery и удержание JUMP у climb-якорей.'
];
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'colossus-inside-', storageNamespace, onReset: () => location.reload() });
void (async () => {
  await import('./game-v3.js');
  const { installColossusVisualTuning } = await import('./visual-tuning.js');
  installColossusVisualTuning();
})();
