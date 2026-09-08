import './styles.css';
import './polish.css';
import './shipyard.css';
import './shipyard-performance.css';
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
import './loadout-performance';
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
import './rigging-dynamics';
import './camera-stabilizer';
import './motion-cues';
import './experience-refit';
import './presentation-refit';
import './shipyard-ui';
import { PelagosGame } from './game';

const appName = 'PELAGOS';
const version = '1.6.6';
const STORAGE_NAMESPACE = 'pocket-works:pelagos';
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);

const releaseNotes = [
  'Модули верфи теперь меняют не только внешний вид: масса корпуса, длина, ширина и осадка реально влияют на инерцию, сопротивление, боковую устойчивость и скорость перекладки курса.',
  'Каждый комплект парусов имеет физическую эффективную площадь, а варианты вёсел — собственную тягу по числу, длине и площади лопастей; Storm Rig и Heavy Sweeps теперь ощущаются по-разному в управлении.',
  'В верфи появился живой профиль ХОД / МАНЁВР / МОРЕ / ГРЕБЛЯ, который сразу пересчитывается при любой замене корпуса, парусов или вёсел.',
  'Сохранён физический такелаж 1.6.5: шкоты следуют за модульным гиком и меняют слабину по фактической нагрузке паруса.'
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
