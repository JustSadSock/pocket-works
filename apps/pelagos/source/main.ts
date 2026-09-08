import './styles.css';
import './polish.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import './sea-profile';
import './ship-refit';
import './marine-refit';
import './ship-modularity';
import './marine-tuning';
import './presence-pass';
import './hydrodynamics-refit';
import './stern-immersion';
import './wake-refit';
import './blender-ship';
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
  'Корабль переведён на модульный loadout: размер корпуса, цветовая схема, парусный план и гребной комплект теперь независимы и могут заменяться без переписывания сцены.',
  'Текущий Long Cutter увеличен до 12,8 м длины и 3,9 м ширины; гребной банк расширен до шести вёсел на каждый борт с отдельными портами и водяными контактами.',
  'Плавучесть получила long-hull фильтрацию волн, связанную модель heave/pitch/roll и ограничитель отрыва корпуса от воды, чтобы корму больше не подбрасывало на гребнях.',
  'Осадка привязана к размерам корпуса, а рулевая лопасть и скег теперь визуально остаются под живой поверхностью воды, пока волна действительно их не оголит.'
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
