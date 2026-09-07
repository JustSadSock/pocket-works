import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SIROCCO';
const version = '1.0.2';
const storageNamespace = 'pocket-works:sirocco';
const releaseNotes = [
  'Перестроена генерация рельефа: вместо одинаковых параллельных рядов появились регионально изгибающиеся гряды, разрывы, седловины и меняющаяся высота дюн.',
  'Повышена плотность ближней геометрии и сглажены высокочастотные формы, чтобы камера больше не проваливалась под визуальную поверхность дюны.',
  'Исправлено инвертированное горизонтальное управление камерой на touch-экране.',
  'Убран торс и таз из first-person рендера: геометрия тела больше не перекрывает нижнюю половину экрана.'
];
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sirocco-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
