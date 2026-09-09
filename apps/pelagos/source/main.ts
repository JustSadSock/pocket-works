import './styles.css';
import './polish.css';
import './shipyard.css';
import './shipyard-performance.css';
import './presentation-refit.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import './sea-profile';
import './ship-refit';
import './rigging-cleanup';
import './marine-refit';
import './sail-uv-refit';
import './ship-modularity';
import './rowing-input-refit';
import './loadout-performance';
import './marine-tuning';
import './presence-pass';
import './hydrodynamics-refit';
import './stern-immersion';
import './ocean-hull-refit';
import './wake-refit';
import './water-contact-refit';
import './speed-water-response';
import './blender-ship';
import './finish-tuning';
import './sail-fabric-refit';
import './sail-lighting-refit';
import './rigging-dynamics';
import './camera-stabilizer';
import './motion-cues';
import './experience-refit';
import './presentation-refit';
import './shipyard-ui';
import { PelagosGame } from './game';

const appName = 'PELAGOS';
const version = '1.6.6';
const STORAGE_NAMESPACE = 'pocket-works:pelagos';
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);

const releaseNotes = [
  'Вёсла снова читаются физически: при удержании ГРЕСТИ весь выбранный комплект выходит из бортов, вращается вокруг реальных уключин, проходит медленный силовой гребок, поднимается на возврате и даёт брызги у лопасти; камера мягко расширяет кадр, чтобы банк не обрезался.',
  'Море замедлено до масштаба 10–16-метрового судна: длинная зыбь больше не выглядит ускоренной съёмкой, при этом визуальная поверхность и физическая волна используют один и тот же спектр.',
  'Взаимодействие корпуса с водой теперь масштабируется числом Фруда: длина выбранного корпуса вместе со скоростью определяет волновое сопротивление, динамическую осадку, удар носом, собственную носовую волну, кормовую впадину и силу кильватера.',
  'Модули верфи остаются физическими: корпус меняет инерцию и поворотливость, паруса — эффективную площадь, вёсла — гребную тягу; профиль ХОД / МАНЁВР / МОРЕ / ГРЕБЛЯ пересчитывается сразу.'
];

registerEnhancedUpdate({ appName, version, releaseNotes });

const canvas = document.querySelector<HTMLCanvasElement>('#renderCanvas');
if (!canvas) throw new Error('Pelagos render canvas is missing');

const game = new PelagosGame(canvas);
createWorkshopMode({
  appName,
  version,
  cachePrefix: 'pelagos-',
  storageNamespace: STORAGE_NAMESPACE,
  onReset: () => game.resetAll()
});

void game.boot().catch((error: unknown) => {
  console.error('[PELAGOS] Critical boot failure.', error);
  game.showBootError(error);
  document.documentElement.dataset.bootError = error instanceof Error ? error.message : String(error);
});
