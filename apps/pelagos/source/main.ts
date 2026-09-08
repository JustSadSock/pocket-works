import './styles.css';
import './polish.css';
import './shipyard.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import './sea-profile';
import './ship-refit';
import './rigging-cleanup';
import './marine-refit';
import './ship-modularity';
import './marine-tuning';
import './presence-pass';
import './hydrodynamics-refit';
import './stern-immersion';
import './wake-refit';
import './water-contact-refit';
import './blender-ship';
import './finish-tuning';
import './sail-lighting-refit';
import './camera-stabilizer';
import './motion-cues';
import './experience-refit';
import './shipyard-ui';
import { PelagosGame } from './game';

const appName = 'PELAGOS';
const version = '1.6.2';
const STORAGE_NAMESPACE = 'pocket-works:pelagos';
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);

const releaseNotes = [
  'Верфь получила свободный живой осмотр: проведи пальцем по кораблю, чтобы вращать трёхчетвертную камеру, а нижняя панель занимает ещё меньше экрана.',
  'Камера теперь учитывает реальную длину выбранного корпуса, поэтому Harbor Cutter и Highboard Cruiser ощущаются разными по масштабу, а не просто разным зумом.',
  'Пена у борта, кормовой контакт и след теперь масштабируются вместе с корпусом и начинаются у фактического транца, а не в точках исходной 9-метровой модели.',
  'Парусная ткань получила отдельную двухстороннюю световую модель без самозатенения, устраняющую чёрные паруса на Safari/WebKit.',
  'Главное меню получило отдельное более дальнее кинематографичное кадрирование, а игровой ракурс показывает больше воды вокруг корпуса для лучшего ощущения массы и масштаба.'
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
