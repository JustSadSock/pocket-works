import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SINEW';
const version = '1.6.0';
const storageNamespace = 'pocket-works:sinew';
const releaseNotes = [
  'Настоящий Blender Asset Forge на Blender 5.2.1 сгенерировал app-local GLB с цветными PBR-доспехами и экипировкой.',
  'Правый палец теперь задаёт не только скорость жеста, но и устойчивую позицию рук: меч и щит можно удерживать высоко, низко и сбоку без новых кнопок.',
  'Рабочая зона оружия покрывает линию ног и high guard; быстрый flick остаётся физическим импульсом поверх выбранной позиции.',
  'Контакт и замах заметнее передают усилие в кисть, локоть, плечо и корпус, при этом клинок сохраняет жёсткость.',
  'Blender-геометрия использует отдельные материалы стали, кожи, дерева, латуни и цветных элементов, а процедурный риг остаётся fallback.',
  'Добавлен Playwright QA bridge для мобильных Chromium/WebKit прогонов и диагностики боевого состояния.'
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sinew-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
