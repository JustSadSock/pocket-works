import './styles.css';
import './living-level.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'COLOSSUS // INSIDE';
const version = '1.5.0';
const storageNamespace = 'pocket-works:colossus-inside';
const releaseNotes = [
  'Колосс теперь является самим уровнем: traversal carriers синхронизируются с Blender-костями груди, плеча и головы.',
  'У каждого разрыва брони работает системный захват края; прыжки, падения и перенос импульса зависят от движения гиганта.',
  'Удар молнии физически выбивает бронепанель, разбрасывает обломки и создаёт реальный обход повреждённой секции.',
  'Ремонт стабилизатора стал трёхфазной задачей: нужно перемещаться между тремя узлами и синхронизировать каждый удержанием JUMP.',
  'Усилены камера, scale cues, живая механика внутренностей, звук шага и финальный переход после стабилизации.'
];
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'colossus-inside-', storageNamespace, onReset: () => location.reload() });
void (async () => {
  await import('./game-v4.js');
  const { installLivingAnimationBridge } = await import('./living-animation-bridge.js');
  installLivingAnimationBridge();
})();
