import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SIROCCO';
const version = '1.0.3';
const storageNamespace = 'pocket-works:sirocco';
const releaseNotes = [
  'Контроллер и foot IK теперь используют точную высоту тех же треугольников, которые видит игрок, поэтому камера больше не оказывается под поверхностью и не смотрит на изнанку дюн.',
  'Исправлено инвертированное вертикальное touch-управление камерой.',
  'Пересобрана first-person геометрия ног: устойчивый изгиб колена, меньший шаг, человеческие пропорции бедра, голени и обуви без растягивания конечностей.',
  'Добавлены проверки непрерывности и нормалей именно визуальной mesh-поверхности на границах чанков.'
];
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version: '1.0.3', releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sirocco-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
