import './styles.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'COLOSSUS // INSIDE';
const version = '1.2.0';
const storageNamespace = 'pocket-works:colossus-inside';
const releaseNotes = [
  'Добавлена полноценная физика персонажа на движущемся теле колосса: баланс, импульсы, прыжок, падение и приземление.',
  'Короткое нажатие JUMP прыгает, удержание у подсвеченного уступа запускает grab/climb с отдельными Blender-анимациями.',
  'Плечевой шарнир теперь отмечен ярким бирюзовым emissive-маяком и локальным светом; броня получила дополнительные сервисные источники света.'
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

void import('./game-v2.js');
