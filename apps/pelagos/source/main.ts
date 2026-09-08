import './styles.css';
import './polish.css';
import './shipyard.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import './sea-profile';
import './ship-refit';
import './marine-refit';
import './marine-tuning';
import './presence-pass';
import './hydrodynamics-refit';
import './wake-refit';
import './blender-ship';
import './ship-polish';
import './ship-modules';
import './camera-stabilizer';
import './motion-cues';
import './experience-refit';
import { installShipyard } from './shipyard';
import { PelagosGame } from './game';

const appName = 'PELAGOS';
const version = '1.5.0';
const STORAGE_NAMESPACE = 'pocket-works:pelagos';
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);

const releaseNotes = [
  'Корабль переведён на модульную архитектуру: класс корпуса, окраска, парусный комплект и гребной комплект теперь описаны отдельными судовыми модулями и сохраняются через новую Верфь.',
  'Текущий PELAGOS Cutter 30 теперь имеет зафиксированный физический масштаб: корпус 9.13 м, ширина 3.48 м, полная длина около 11.7 м и водоизмещение около 5.6 т.',
  'Базовый гребной комплект увеличен до шести пар — двенадцати физических вёсел — с отдельными уключинами, втягиванием под планширь, флюгированием лопасти и тягой только при контакте с локальной волной.',
  'Гидродинамика получила added-water mass, широкую опорную плоскость корпуса и отдельный контроль погружения кормы: короткий гребень больше не должен катапультировать судно и оголять руль/скег.',
  'Blender-катер дополнительно насыщен работающими судовыми деталями: штурвал, компас, фонари, колокол, блоки, якоря и динамические шкоты связаны с фактическим состоянием судна.'
];

registerEnhancedUpdate({ appName, version, releaseNotes });
installShipyard();

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
