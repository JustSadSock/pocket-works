import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SIROCCO';
const version = '1.6.0';
const storageNamespace = 'pocket-works:sirocco';
const releaseNotes = [
  'Песок v2 различает рыхлый и уплотнённый слой: свежие валики осыпаются, повторный след уплотняется и становится твёрже.',
  'Локальная сетка теперь сгущает тот же vertex budget вокруг ног, поэтому следы заметно плавнее без возврата старых лагов.',
  'Sand physics сам снижает avalanche/settling budget при дорогом WebKit-тике и постепенно восстанавливает его при наличии запаса.',
  'Бедуин получил отдельную фактуру кожи, льна и куфии, а first-person камера ещё надёжнее вынесена из головы.',
  'Playwright Chromium/WebKit проверяет обычный взгляд вниз на тело, экстремальную камеру, физический песок, Blender-скалы и CPU-бюджет.'
];
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sirocco-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
