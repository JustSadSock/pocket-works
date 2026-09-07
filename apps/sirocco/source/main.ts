import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SIROCCO';
const version = '1.2.0';
const storageNamespace = 'pocket-works:sirocco';
const releaseNotes = [
  'Процедурное тело из примитивов заменено на полноценный CC0 skinned humanoid Quaternius с готовыми walk/idle-анимациями; поверх модели собран выраженный образ бедуинского путника с длинной светлой тобой, кушаком, куфией и рукавами.',
  'Ходьба теперь управляется настоящим скелетным animation clip с плавным idle/walk blending и скоростью шага, привязанной к реальной скорости персонажа; контакт стоп определяется по костям анимированной модели вместо растягивания процедурных ног.',
  'Исправлен большой тёмный круг вокруг игрока: локальный слой физического песка больше не поднят искусственно на пять сантиметров и не принимает отдельную shadow map, поэтому он визуально сливается с основной пустыней.',
  'First-person камера вынесена перед лицом модели и получила более спокойный bob/sway, чтобы тело ощущалось человеческим и не залезало внутрь камеры.'
];
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version: '1.2.0', releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sirocco-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
