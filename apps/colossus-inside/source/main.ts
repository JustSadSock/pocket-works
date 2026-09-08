import './styles.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'COLOSSUS // INSIDE';
const version = '1.0.0';
const storageNamespace = 'pocket-works:colossus-inside';
const releaseNotes = [
  'Добавлен законченный вертикальный slice: спина → плечо → внутренности → ремонт → голова.',
  'Три Blender Asset Forge GLB используют настоящие armature и именованные анимации колосса, анатомии и игрока.',
  'Движущаяся поверхность физически передаёт игроку движение и импульс, а ремонт реально стабилизирует походку.'
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({
  appName,
  version,
  cachePrefix: 'colossus-inside-',
  storageNamespace,
  onReset: () => location.reload()
});

void import('./game.js');
