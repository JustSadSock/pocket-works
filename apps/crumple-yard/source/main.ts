import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { CrumpleGame } from './game';

const VERSION = '1.4.0';
const RELEASE_NOTES = ["Раздельная витрина гаража и живой осмотр трёх детализированных моделей с салонами и деформируемыми крышами.","Новые ударные бочки и ящики рядом со стартом; двор возвращается в исходное состояние для нового заезда.","Точнее показания силы ударов, читаемая телеметрия, исправления повторных заездов и проверенная логика реверса."];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName: 'CRUMPLE // YARD', version: VERSION, releaseNotes: RELEASE_NOTES });

const game = new CrumpleGame();
createWorkshopMode({
  appName: 'CRUMPLE // YARD',
  version: VERSION,
  cachePrefix: 'crumple-yard-',
  storageNamespace: 'pocket-works:crumple-yard',
  onReset: () => game.resetAll()
});

void game.boot();
