import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { RaceGame } from './race-game';

const version = '3.1.0';
const appName = 'ПЕТЛЯ 17';
const namespace = 'pocket-works:petlya-17';

installMobileRuntime();
registerEnhancedUpdate({
  appName,
  version,
  releaseNotes: [
    'Новая simcade-модель сцепления, скольжения, рыскания и переноса нагрузки.',
    'Соперники тормозят перед поворотами, готовят внешнюю линию и атакуют апекс.',
    'Контакты передают продольный и боковой импульс между машинами.',
    'Кокпит реагирует на перегрузки, скольжение, разгон и торможение.',
    'Зеркала показывают изображение с настоящей задней камеры.'
  ]
});

const canvas = document.querySelector<HTMLCanvasElement>('#renderCanvas');
if (canvas) {
  const game = new RaceGame(canvas);
  createWorkshopMode({
    appName,
    version,
    cachePrefix: 'petlya-17-',
    storageNamespace: namespace,
    onReset: () => game.resetAll()
  });
  void game.boot();
}
