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
import './blender-ship';
import './finish-tuning';
import './camera-stabilizer';
import './motion-cues';
import './experience-refit';
import './shipyard-ui';
import { PelagosGame } from './game';

const appName = 'PELAGOS';
const version = '1.6.1';
const STORAGE_NAMESPACE = 'pocket-works:pelagos';
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);

const releaseNotes = [
  'Верфь теперь оставляет корабль в кадре: нижняя панель стала компактнее, варианты листаются по горизонтали, а камера переходит в отдельный режим живого предпросмотра.',
  'Корпус получил более тяжёлую вертикальную динамику: он следует за длинным профилем моря с инерцией, а не подпрыгивает вслед за каждой локальной волной.',
  'Кормовая ватерлиния теперь ограничивает одновременно дифферент и подъём центра корпуса, удерживая транец связанным с водой.',
  'Руль посажен глубже и перестал целиком проступать сквозь прозрачную воду при обычной качке.'
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
