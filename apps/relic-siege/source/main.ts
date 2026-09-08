import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'RELIC SIEGE';
const version = '2.0.0';
const storageNamespace = 'pocket-works:relic-siege';

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({
  appName,
  version,
  releaseNotes: [
    'Круглая арена полностью заменена многоуровневой Blender-крепостью с отдельными зонами и маршрутом к верхнему святилищу.',
    'Бой теперь использует комбо, удерживаемый блок, тайминговое парирование и заряжаемую силу RELIC.',
    'Keeper, Ash Raider и Ash Warden загружаются как Blender-персонажи; мобильный QA отслеживает реальную геометрию, grounded и прогресс прохождения.'
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
