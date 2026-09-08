import './styles.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'COLOSSUS // INSIDE';
const version = '1.4.0';
const storageNamespace = 'pocket-works:colossus-inside';
const releaseNotes = [
  'Спина колосса собрана как сегментированная биомеханическая броня с отдельными левыми и правыми панелями, центральным хребтом, плечевыми узлами и шеей.',
  'Стартовая защитная ниша теперь существует в самом мире, а маршрут читается как часть корпуса, а не как отдельная дорога.',
  'Внутри появились пол, силовой каркас, поперечные рёбра, мембраны, сервисные огни и физически видимый стабилизатор.',
  'Финальный mobile readability pass поднимает локальный контраст брони, персонажа и навигационных инкрустаций одинаково в Safari/WebKit и Chromium.',
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
  const { installReadabilityPass } = await import('./readability-pass.js');
  installReadabilityPass();
})();
