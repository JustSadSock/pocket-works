import './styles.css';
import './polish.css';
import './shipyard.css';
import './presentation-refit.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import './sea-profile';
import './ship-refit';
import './rigging-cleanup';
import './marine-refit';
import './rigging-dynamics';
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
import './presentation-refit';
import './shipyard-ui';
import { PelagosGame } from './game';

const appName = 'PELAGOS';
const version = '1.6.5';
const STORAGE_NAMESPACE = 'pocket-works:pelagos';
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);

const releaseNotes = [
  'Такелаж полностью привязан к реальной парусной геометрии: четыре ванты, форштаг, ахтерштаг и две гика-шкоты больше не заканчиваются в пустоте и двигаются вместе с рангоутом.',
  'Гика-шкоты теперь физически читают нагрузку на парус: при наполненном парусе они натягиваются, а при потере тяги получают заметную слабину и лёгкое колебание.',
  'Старые декоративные тросы принудительно отключаются после загрузки сцены, поэтому Blender-модель и runtime-такелаж больше не накладываются друг на друга.',
  'Сохранены адаптивная камера, модульная верфь, hull-aware океан, тяжёлая посадка и мобильная фильтрация 1.6.4.'
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
