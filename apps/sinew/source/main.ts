import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SINEW';
const version = '1.0.2';
const storageNamespace = 'pocket-works:sinew';
const releaseNotes = [
  'Щит получил настоящие контактные ограничения: он упирается в тело противника, другой щит и собственное тело вместо прохождения насквозь.',
  'Для первого лица введена camera-safe зона: собственный щит больше не может закрывать центр поля зрения и прижиматься к голове.',
  'У оружия появился отдельный момент движения: начало замаха ощущается как сопротивление массы, а остановка пальца даёт короткое физическое продолжение движения.',
  'Стойка стала жёстче: сильнее сцепление с землёй, быстрее гаснут случайные колебания, но активные удары сохраняют инерцию.',
  'Контакт щитом теперь передаёт импульс руке, устойчивости и телам бойцов и даёт звуковую/камерную обратную связь.'
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sinew-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
