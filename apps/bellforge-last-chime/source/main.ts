import './styles.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'BELLFORGE // THE LAST CHIME';
const version = '1.0.0';
const storageNamespace = 'pocket-works:bellforge-last-chime';
const releaseNotes = [
  'Законченная сюжетная кампания через Рыночный квартал, Литейную, крыши и башню Великого Колокола.',
  'Blender Asset Forge создаёт архитектуру, механизмы, пропсы и ригнутых персонажей как основной production pipeline.',
  'Добавлены резонансные головоломки, погоня, постановочные сцены, мобильное управление, collision proxies и procedural audio.'
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
