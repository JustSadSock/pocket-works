import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'FIRN';
const version = '1.1.0';
const storageNamespace = 'pocket-works:firn';
const releaseNotes = [
  'Полностью перестроен горный рельеф: крупные массивы и вершины теперь окружают стартовую альпийскую чашу.',
  'Добавлено настоящее карабканье на крутых склонах с потерей скорости, сопротивлением подъёму и срывами.',
  'Глубокий снег просаживает тело, сильно замедляет движение и оставляет значительно более глубокие следы.',
  'Исправлено вертикальное touch-управление камерой и усилена физическая реакция на рыхлый снег, наст и лёд.'
];
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'firn-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
