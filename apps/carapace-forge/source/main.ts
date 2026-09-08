import './styles.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'CARAPACE FORGE';
const version = '1.0.0';
const storageNamespace = 'pocket-works:carapace-forge';
const releaseNotes = [
  'Прямое A/B сравнение Babylon-примитивов и Blender Asset Forge модели в одной мини-игре.',
  'Blender-краб имеет armature и отдельные Idle, Scuttle, Pinch и Celebrate анимации.',
  'Добавлены мобильное управление, сбор жемчужин и процедурно варьируемый Web Audio.'
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'carapace-forge-', storageNamespace, onReset: () => location.reload() });
void import('./game.js');
