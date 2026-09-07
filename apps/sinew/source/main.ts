import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SINEW';
const version = '1.0.1';
const storageNamespace = 'pocket-works:sinew';
const releaseNotes = [
  'Управление по вертикали исправлено: движение пальца вверх теперь поднимает взгляд, вниз — опускает.',
  'Физический риг стал значительно устойчивее: убрана водянистая раскачка кистей, меча, щита и корпуса при спокойном управлении.',
  'Резкие движения сохраняют короткую инерцию и сопротивление массы, а отпускание движения быстро возвращает бойца в устойчивую стойку без скольжения.',
  'WebAudio надёжнее разблокируется и восстанавливается в Safari/iOS после interrupted/suspended состояний; боевые и шаговые звуки стали заметнее.'
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sinew-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
