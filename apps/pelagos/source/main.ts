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
import { PelagosGame } from './game';

const appName = 'PELAGOS';
const version = '1.3.0';
const STORAGE_NAMESPACE = 'pocket-works:pelagos';
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);

const releaseNotes = [
  'Убраны старые wet-band ленты под Blender-корпусом, которые на гребне волны выглядели как чёрные плавники под кормой.',
  'Восемь вёсел получили уключины как фиксированные шарниры, медленный рабочий ход, уборку внутрь корпуса и тягу только при реальном контакте лопасти с локальной волной.',
  'В море появился плотный процедурный слой ориентиров: дрейфующие брёвна, бочки, ящики, буи и пятна водорослей покачиваются на том же волновом поле и дают заметный параллакс.',
  'Новые близкие ориентиры делают разгон, торможение и поворот визуально читаемыми даже вдали от суши, не превращая открытое море в островную карту.'
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
