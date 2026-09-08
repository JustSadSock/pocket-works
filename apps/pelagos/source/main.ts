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
const version = '1.6.0';
const STORAGE_NAMESPACE = 'pocket-works:pelagos';
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);

const releaseNotes = [
  'Добавлена полноценная верфь: корпус, отделка, паруса и вёсла теперь выбираются независимо, применяются сразу и сохраняются между запусками.',
  'Добавлены четыре размера корпуса, пять вариантов отделки, четыре парусных плана и четыре гребных комплекта, плюс ручная окраска борта, палубы и парусов.',
  'Blender-корпус получил закрытую полку под палубой, устраняющую боковой просвет между верхней обшивкой и палубой; лишние висящие линии такелажа удалены.',
  'Физика длинного корпуса сильнее фильтрует короткие волны и отдельно удерживает кормовую ватерлинию, чтобы транец больше не задирало на одиночных гребнях.'
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
