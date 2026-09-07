import './styles.css';
import './polish.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { PelagosGame } from './game';

const appName = 'PELAGOS';
const version = '1.0.0';
const STORAGE_NAMESPACE = 'pocket-works:pelagos';
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);

registerEnhancedUpdate({
  appName,
  version,
  releaseNotes: [
    'Единое шестикомпонентное поле волн теперь управляет рендером и десятиточечной плавучестью корпуса.',
    'Корабль полностью пересобран: полноценный корпус, палуба, каюта, оснастка, руль, якоря, вёсла и динамическая парусина.',
    'Добавлены процедурные материалы дерева и ткани, динамические тени, фонари, облака, белые барашки и физический кильватер.',
    'Уточнены гидродинамическое сопротивление, боковая работа киля, руль, крен, волновой наклон и адаптивный мобильный рендер.'
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
