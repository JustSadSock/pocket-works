import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'RELIC SIEGE';
const version = '1.0.0';
const storageNamespace = 'pocket-works:relic-siege';

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({
  appName,
  version,
  releaseNotes: [
    'Новая сюжетная 3D-осада с тремя обелисками и финальным Стражем.',
    'Blender Asset Forge создаёт крепость, реликт и анимированного Стража.',
    'Audio Asset Forge генерирует музыку, ветер и боевые звуки без локального ПК.'
  ]
});
createWorkshopMode({
  appName,
  version,
  cachePrefix: 'relic-siege-',
  storageNamespace,
  onReset: () => location.reload()
});

void import('./game');
