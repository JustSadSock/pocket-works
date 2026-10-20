import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { CrumpleGame } from './game';

const VERSION = '1.3.0';
const RELEASE_NOTES = ["Три автомобиля получили разные деформируемые силуэты, составные колёса, окна и кузовные детали.","Перестроен испытательный двор: промаркированные барьеры, металлические стойки, рампа и подвижные ящики.","Исправлен задний ход, добавлены заносы и вращение машины для осмотра в гараже."];

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
