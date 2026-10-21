import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { CrumpleGame } from './game';

const VERSION = '1.6.0';
const RELEASE_NOTES = ["Деформация капота, бамперов, решётки и наружных деталей синхронизирована с повреждениями кузова.","Трещины каждого стекла, отключение повреждённых светодиодных фар и фонарей.","Два настоящих следа шин при скольжении и корректный сброс следов при новом заезде."];

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
