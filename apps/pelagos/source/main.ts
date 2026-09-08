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
import { PelagosGame } from './game';

const appName = 'PELAGOS';
const version = '1.1.0';
const STORAGE_NAMESPACE = 'pocket-works:pelagos';
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);

const releaseNotes = [
  'Корпус получил динамическую мокрую ватерлинию, локальную контактную пену и кильватер с памятью, поэтому движение теперь оставляет видимый физический след в море.',
  'Руль, рыскание и удары носом получили дополнительную инерцию: косая зыбь слегка сносит курс, а встреча с гребнем отнимает импульс вместо скольжения сквозь волну.',
  'Море стало пространственно неоднородным: крупные группы зыби чередуются со спокойными участками, появились ветровые полосы, редкие дальние шквалы и морские птицы.',
  'Дерево, парусина, металл, освещение, камера и звук переработаны вокруг нагрузки: мокрые поверхности блестят иначе, рангоут живёт под ветром, а корпус, снасти и вёсла звучат по фактическому движению.'
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
