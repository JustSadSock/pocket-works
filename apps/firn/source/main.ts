import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'FIRN';
const version = '1.2.0';
const storageNamespace = 'pocket-works:firn';
const releaseNotes = [
  'Исправлено управление камерой по обеим осям: жесты снова соответствуют направлению взгляда.',
  'Перестроен внешний вид гор: более резкие хребты, кулуары, уступы и выраженные альпийские массивы.',
  'На крутых склонах проступает тёмная порода, а снег получил более матовую и натуральную поверхность.',
  'Добавлен отдельный атмосферный небесный купол и более естественный высотный туман.'
];
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'firn-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
