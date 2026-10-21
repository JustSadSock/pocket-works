import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { CrumpleGame } from './game';

const VERSION = '1.5.0';
const RELEASE_NOTES = ["Скорость столкновения определяется до физического разрешения удара — больше никаких 0 км/ч при таране стены.","Колёса и подвеска повреждаются в точке удара: симметричное самопроизвольное повреждение устранено.","Более глубокое смятие кузова, ускоренный разгон и современный внешний вид автомобилей: светодиодная оптика, диски, аэродинамические детали."];

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
