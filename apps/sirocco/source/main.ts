import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SIROCCO';
const version = '1.5.0';
const storageNamespace = 'pocket-works:sirocco';
const releaseNotes = [
  'Физический песок значительно оптимизирован для iPhone/Safari: локальная High-сетка стала примерно втрое дешевле, а avalanche и coarse mesh больше не перестраиваются почти каждый кадр.',
  'Зона рендера вокруг игрока убрана радиальной replacement-поверхностью, плавным затуханием деформации и непрерывным far terrain без квадратного отверстия.',
  'Модель бедуина получила фактуру ткани и кожи, ремень через плечо, сумку, бурдюк, дополнительные слои одежды и лёгкое движение с походкой.',
  'Обновлены мобильные quality budgets и Playwright-регрессии производительности, WebKit, физического песка и персонажа.'
];
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sirocco-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
