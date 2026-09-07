import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SIROCCO';
const version = '1.1.0';
const storageNamespace = 'pocket-works:sirocco';
const releaseNotes = [
  'Песок переведён с декоративных геометрических следов на локальную физическую world-space heightfield: стопа вдавливает поверхность, выталкивает валик, переносит песок вниз по склону и оставляет устойчивую деформацию, не зависящую от направления камеры.',
  'Добавлена отдельная высокодетализированная физическая sand-surface вокруг игрока, поэтому сантиметровые отпечатки и локальное осыпание видны без увеличения детализации всей бесконечной пустыни.',
  'First-person тело пересобрано в образе бедуинского путника: длинная светлая туника, пояс, свободные штаны, обмотки, кожаная обувь, рукава и руки, а ноги используют устойчивый двухзвенный IK.',
  'Освещение и тени переделаны: удалено полосатое terrain self-shadowing и чрезмерная periodic normal-map рябь, солнце опущено ниже для читаемой формы дюн, а персонаж получает отдельную мягкую фильтрованную динамическую тень.'
];
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version: '1.1.0', releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sirocco-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
