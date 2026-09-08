import './styles.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'BELLFORGE // THE LAST CHIME';
const version = '1.1.1';
const storageNamespace = 'pocket-works:bellforge-last-chime';
const releaseNotes = [
  'Новый cache/fingerprint boundary гарантированно отделяет этот релиз от 1.1.0 после исправления iOS update-convergence.',
  'Исправлено инвертированное управление камерой и улучшена точность touch-look.',
  'Landscape HUD, safe-area и двухручные зоны управления переработаны для iPhone.',
  'Blender-персонажи, механизмы и мобильный render path получили финальный production pass.'
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({
  appName,
  version,
  cachePrefix: 'bellforge-last-chime-',
  storageNamespace,
  onReset: () => location.reload()
});

void import('./game.js');
