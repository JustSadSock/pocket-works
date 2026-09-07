import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SIROCCO';
const version = '1.0.4';
const storageNamespace = 'pocket-works:sirocco';
const releaseNotes = [
  'Исправлена настоящая причина изнанки дюн: winding всех terrain-треугольников был обратным стандартному Babylon.js TiledGround, поэтому верх песка отбрасывался back-face culling, а игрок видел поверхность только снизу.',
  'Ближние чанки и дальний LOD теперь используют тот же top-facing порядок индексов, что встроенный Babylon.js ground для XZ-сетки с растущей координатой Z.',
  'Тем же исправлением приведены в правильную ориентацию геометрические следы и локальные следы осыпания песка.',
  'Добавлен регрессионный тест winding и продолжены проверки непрерывности визуальной mesh-поверхности на всех профилях качества.'
];
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version: '1.0.4', releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sirocco-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
