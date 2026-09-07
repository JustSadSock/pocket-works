import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'FIRN';
const version = '1.0.0';
const storageNamespace = 'pocket-works:firn';
const releaseNotes = [
  'Процедурные снежные горы с хребтами, седловинами, плато и продуваемыми зонами.',
  'Тип снега влияет на глубину шага, скорость, сцепление, скольжение и следы.',
  'Свежие следы реально деформируют локальную высокодетальную снежную поверхность.',
  'Добавлены позёмка, снежные срывы, адаптивное качество, мобильное touch-управление и генеративный звук.'
];
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'firn-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
