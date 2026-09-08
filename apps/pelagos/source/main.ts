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
import './motion-cues';
import './experience-refit';
import { PelagosGame } from './game';

const appName = 'PELAGOS';
const version = '1.4.1';
const STORAGE_NAMESPACE = 'pocket-works:pelagos';
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);

const releaseNotes = [
  'Исправлена физическая конвенция руля: перекладка вправо теперь действительно разворачивает судно вправо, а не создаёт противоположный момент.',
  'Убрано второе скрытое сглаживание угловой скорости, которое почти полностью гасило развитие поворота поверх уже существующей инерции корпуса и руля.',
  'Исправлена конвенция apparent wind для парусной поляры: встречный поток снова является no-go зоной, попутный — рабочим курсом, а индикатор оптимального трима соответствует физике.',
  'Гребля сведена к одному contact-gated источнику тяги и одному владельцу анимации восьми вёсел, без двойного импульса и конкурирующих поз.'
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
