import './styles.css';
import './polish.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import './ship-refit';
import { PelagosGame } from './game';

const appName = 'PELAGOS';
const version = '1.0.1';
const STORAGE_NAMESPACE = 'pocket-works:pelagos';
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);

registerEnhancedUpdate({
  appName,
  version,
  releaseNotes: [
    'Корпус пересобран в цельную судовую форму с нормальной килеватостью, бортами, палубной кривизной и читаемой ватерлинией.',
    'Исправлена посадка на воде: палуба больше не лежит почти на поверхности, а расчётная осадка соответствует форме корпуса.',
    'Увеличены масса и инерция, смягчены руль, дифферент и крен — корабль ощущается тяжелее и перестал дёргаться как игрушка.',
    'Портретная камера отведена назад и теперь держит корпус, ватерлинию и мачту в одном кадре.'
  ]
});

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
