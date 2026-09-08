import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SINEW';
const version = '1.8.0';
const storageNamespace = 'pocket-works:sinew';
const releaseNotes = [
  'First-person риг получил anatomical envelope: меч и щит больше не могут постоянно перекрывать центральную зону камеры.',
  'Физический щит игрока уменьшен до 78 см, AI — до 82 см; Blender-визуал и collision остаются синхронизированы.',
  'Спокойная стойка меча смещена вправо, но быстрый реальный удар по-прежнему может пересекать центр экрана.',
  'Импульсы меча и щита теперь частично передаются в корпус, чтобы руки не ощущались отдельными плавающими манипуляторами.',
  'Расширен mobile FOV и повышена читаемость Blender-стали и силуэта противника.',
  'QA bridge получил метрики вторжения оружия в центральный first-person corridor для Chromium/WebKit screenshot-проверок.'
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sinew-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
