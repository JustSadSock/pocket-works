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
import './ship-polish';
import './camera-stabilizer';
import './motion-cues';
import './experience-refit';
import { PelagosGame } from './game';

const appName = 'PELAGOS';
const version = '1.5.0';
const STORAGE_NAMESPACE = 'pocket-works:pelagos';
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);

const releaseNotes = [
  'Blender-катер заново насыщен судовыми деталями: кнехты и швартовное железо, шкивы, нагели, шпигаты, клюзы, компас, колокол, кормовые фонари и более богатая столярка теперь читаются даже с мобильной камеры.',
  'Корабельные фонари физически раскачиваются относительно крена и дифферента, живой огонь мерцает ночью и в шторм, а судовой колокол и его язык получают собственную вторичную инерцию.',
  'Штурвал теперь действительно вращается вместе с перекладкой руля, компасная картушка удерживает север, закреплённые якоря едва играют на волне, а блоки реагируют на нагрузку паруса.',
  'Главный гик получил видимые динамические шкоты: они постоянно перестраиваются между кормовыми блоками и концом гика, поэтому рангоут и такелаж наконец ощущаются одной работающей системой.'
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
