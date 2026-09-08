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
const version = '1.6.4';
const STORAGE_NAMESPACE = 'pocket-works:pelagos';
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);

const releaseNotes = [
  'Игровая камера получила финальную композиционную поправку по длине корпуса и высоте выбранного рангоута: крупные корабли и высокие паруса больше не прижимаются к краям портретного кадра.',
  'Подсказки обучения стали заметно компактнее и прозрачнее, поэтому они объясняют управление, не закрывая мачту, парус и горизонт.',
  'Палуба, дерево, ткань и корпус используют усиленную анизотропную фильтрацию и трилинейное семплирование для более чётких косых поверхностей на мобильном WebGL.',
  'Сохранены тяжёлая длиннокорпусная плавучесть, посадка кормы, объёмная ватерлиния и hull-aware океан из 1.6.3.'
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
