import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SIROCCO';
const version = '1.6.0';
const storageNamespace = 'pocket-works:sirocco';
const releaseNotes = [
  'Песок v2 различает рыхлый и уплотнённый слой: свежий валик осыпается, повторный след уплотняется и становится твёрже.',
  'Передвижение реагирует на состояние поверхности: рыхлый песок сильнее замедляет и погружает ноги, утоптанный след даёт более уверенную опору.',
  'Обновлены материалы и слои одежды бедуина: выцветание, пыль, узорный шарф и дополнительный пояс без пересечений с камерой.',
  'Playwright Chromium/WebKit теперь дополнительно проверяет CPU-бюджет песка, рыхлость, уплотнение и повторные следы.'
];
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sirocco-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
