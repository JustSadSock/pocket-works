import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SIROCCO';
const version = '1.0.0';
const storageNamespace = 'pocket-works:sirocco';
const releaseNotes = [
  'Процедурная бесшовная пустыня из направленных дюн с chunk streaming и несколькими пространственными масштабами.',
  'Полноценное first-person тело с humanoid rig, процедурной походкой, foot planting и IK-адаптацией к склону.',
  'Объёмные следы с вдавливанием и песчаным валиком, локальное осыпание склонов и умеренные частицы песка.',
  'Мобильное landscape-управление, атмосферное небо, мягкие каскадные тени и автоматические профили качества.'
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({
  appName,
  version,
  cachePrefix: 'sirocco-',
  storageNamespace,
  onReset: () => location.reload()
});

void import('./main.js');
