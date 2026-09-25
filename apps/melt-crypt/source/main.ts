import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'MELT//CRYPT';
const version = '1.0.0';
const storageNamespace = 'pocket-works:melt-crypt';
const releaseNotes = [
  'Added a complete first-person roguelike loop with procedural floors, combat, room clearing and descent.',
  'Every monster mutates a procedural body, palette, anatomy, stats and combat ability.',
  'Added pixel-3D rendering, psychedelic lighting, fog, crystals and potion-driven screen effects.',
  'Added relics, bizarre potions, shrines, chests, discoveries, local persistence and touch/desktop controls.'
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version: '1.0.0', releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'melt-crypt-', storageNamespace, onReset: () => location.reload() });

void import('./main.js');
