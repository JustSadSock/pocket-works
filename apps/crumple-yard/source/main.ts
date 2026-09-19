import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { CrumpleGame } from './game';

const VERSION = '1.0.0';
const RELEASE_NOTES = [
  'Rapier contact-force события и точка контакта питают накопительную модель повреждений вместо переключения готовых состояний.',
  'Деформируемый кузов, отрыв панелей, колёса, подвеска, рулевое, двигатель, охлаждение, трансмиссия, свет и стекло связаны с одним физическим состоянием.',
  'Три разных автомобиля, три пресета для каждого, компактный crash-test yard, движущийся трафик и портретное управление входят в первый играбельный релиз.'
];

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
