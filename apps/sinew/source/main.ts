import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SINEW';
const version = '1.0.0';
const storageNamespace = 'pocket-works:sinew';
const releaseNotes = [
  'Новая физическая дуэль: движение слева, всё управление верхом тела — только правым пальцем.',
  'Процедурный риг с инерцией корпуса, рук, меча и щита; игрок видит собственные ноги и торс.',
  'Swept-контакты клинка различают медленное касание, удар по телу, блок щитом и столкновение мечей.',
  'AI использует тот же контроллер позы, телеграфирует замахи и реагирует на реальное положение оружия игрока.'
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sinew-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
