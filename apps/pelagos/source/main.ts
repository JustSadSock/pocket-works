import './styles.css';
import './polish.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import './sea-profile';
import './ship-refit';
import './marine-refit';
import './marine-tuning';
import './presence-pass';
import './wake-refit';
import './blender-ship';
import './camera-stabilizer';
import { PelagosGame } from './game';

const appName = 'PELAGOS';
const version = '1.2.0';
const STORAGE_NAMESPACE = 'pocket-works:pelagos';
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);

const releaseNotes = [
  'Камера переведена на единый абсолютный контроллер: устранён накопительный дрейф между старыми camera-pass, горизонт стабилен, а поворот и вертикальная качка фильтруются без улётов.',
  'Главный корпус, палуба, киль, штевни, фальшборты, поручни, кокпит, люки, цепные планки и мелкие палубные детали теперь создаются Blender Asset Forge и загружаются как единый GLB.',
  'Blender-корпус сохраняет существующие физические паруса, вёсла, снасти, ватерлинию, пену и гидродинамику, поэтому качество модели выросло без потери реактивной физики.',
  'Процедурный корпус оставлен как автоматический fallback: если GLB недоступен, путешествие всё равно запускается и остаётся полностью игровым.'
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
