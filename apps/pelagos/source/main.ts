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
const version = '1.4.0';
const STORAGE_NAMESPACE = 'pocket-works:pelagos';
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);

const releaseNotes = [
  'Парус теперь сразу готов к работе при выходе в море: первые секунды одинаково читаются в Safari/WebKit и Chromium без вида полусвёрнутой ткани.',
  'Камера заново скомпонована вокруг паруса и горизонта: корабль меньше перекрывает портретный экран, поворот даёт мягкий упреждающий взгляд, а вертикальная качка остаётся отфильтрованной.',
  'Blender-корпус получил жилую палубу с банками кокпита, решёткой, компасным постом, швартовым железом, рымами, бухтами троса и ящиком; мобильные материалы лучше читают дерево, латунь и канат.',
  'На парусе появились физические telltales и вымпел: они реагируют на apparent wind, порывы и эффективность настройки и превращают ветер из числа в заметную часть управления.'
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
