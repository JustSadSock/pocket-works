import './styles.css';
import './polish.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import './sea-profile';
import './ship-refit';
import './marine-refit';
import { PelagosGame } from './game';

const appName = 'PELAGOS';
const version = '1.0.2';
const STORAGE_NAMESPACE = 'pocket-works:pelagos';
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);

registerEnhancedUpdate({
  appName,
  version,
  releaseNotes: [
    'Грот и стаксель заменены на физические тканевые поверхности: ветер наполняет их, слабая тяга заставляет провисать и хлопать, а при старте они плавно разворачиваются на рангоуте.',
    'Четыре гигантских весла заменены восемью меньшими судовыми вёслами, которые убираются внутрь корпуса и выходят через борт только во время гребли.',
    'Гребной цикл замедлен и синхронизирован с силой тяги: рабочий ход происходит только при погружённой лопасти, восстановление идёт с флюгированием над водой.',
    'Море получило перекрёстную зыбь и более широкий негармонический спектр волн, поэтому поверхность меньше повторяется, оставаясь общей для рендера и физики корпуса.'
  ]
});

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
