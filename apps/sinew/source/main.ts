import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SINEW';
const version = '1.1.0';
const storageNamespace = 'pocket-works:sinew';
const releaseNotes = [
  'Бой переведён на active-body модель: быстрый жест теперь проходит через load, strike, follow-through и recovery вместо простого следования оружия за камерой.',
  'Направление жеста естественно формирует горизонтальные, диагональные, верхние и восходящие удары с полноценной 3D-траекторией кисти и клинка.',
  'Лезвие получило edge roll, короткий шаг центра массы в удар и наказуемое восстановление после промаха или жёсткого блока.',
  'Щит управляется отдельно от меча: держится относительно корпуса и автоматически смещается к реальной угрозе от клинка противника, не копируя плоскость камеры.',
  'Мечи могут входить в краткий физический bind при медленном контакте; давление влияет на устойчивость обоих бойцов.',
  'Сильные попадания, блоки и clashes получили короткий hit-stop, а AI расширен backhand/rising ударами, более резкими замахами, шагом в атаку и recovery.'
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sinew-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
