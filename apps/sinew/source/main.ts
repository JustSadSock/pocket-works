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
  'Щит игрока уменьшен до 64 см, AI — до 78 см; Blender-визуал и collision остаются синхронизированы.',
  'Нижняя защитная зона расширена: щит может осознанно опускаться ниже без преждевременного возврата в camera-safe коридор.',
  'Спокойная стойка меча смещена вправо, но быстрый реальный удар по-прежнему может пересекать центр экрана.',
  'Импульсы меча и щита частично передаются в корпус, чтобы руки не ощущались отдельными плавающими манипуляторами.',
  'Mobile FOV расширен до 1.25, а first-person плечи и Blender-броня игрока очищены из камеры без упрощения противника.',
  'Dedicated landscape Playwright QA проверяет neutral/high/low/workspace/strike позы в Chromium и WebKit.'
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sinew-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
