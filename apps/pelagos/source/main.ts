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
import './sail-uv-refit';
import './ship-modularity';
import './marine-tuning';
import './presence-pass';
import './hydrodynamics-refit';
import './stern-immersion';
import './ocean-hull-refit';
import './wake-refit';
import './water-contact-refit';
import './blender-ship';
import './finish-tuning';
import './sail-fabric-refit';
import './sail-lighting-refit';
import './camera-stabilizer';
import './motion-cues';
import './experience-refit';
import './shipyard-ui';
import { PelagosGame } from './game';

const appName = 'PELAGOS';
const version = '1.6.3';
const STORAGE_NAMESPACE = 'pocket-works:pelagos';
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);

const releaseNotes = [
  'Океан теперь знает фактические длину и ширину выбранного корпуса: волна разгружается внутри скрытого объёма судна и больше не пытается визуально пройти сквозь днище.',
  'Старый фиксированный 3,7-метровый след в шейдере заменён масштабируемым полем давления у носа и транца; дальний кильватер остаётся у отдельной физически масштабируемой системы.',
  'Вдоль ватерлинии появился постоянный тонкий мениск, который связывает корпус с водой даже на малой скорости, а при вертикальном движении и волнении контакт становится заметнее.',
  'Осмотр в верфи теперь двухосевой: горизонтальный жест вращает корабль, вертикальный поднимает и опускает точку наблюдения для проверки палубы, парусов и ватерлинии.',
  'PELAGOS сохраняет тяжёлую длиннокорпусную плавучесть 1.6.2 и отдельную защиту кормы от визуального вылета руля.'
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
