import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SIROCCO';
const version = '1.5.1';
const storageNamespace = 'pocket-works:sirocco';
const releaseNotes = [
  'Следы в песке стали заметно читаемее: углубления получают локальное затенение, а выдавленные края — мягкий светлый контраст.',
  'Солнце стало направленнее, sky fill слабее, поэтому формы дюн и мелкий рельеф лучше читаются без старых полос и квадратных теней.',
  'Контактная тень персонажа стала плотнее и мягче по краям, не возвращая realtime shadow map на terrain.'
];
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sirocco-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
