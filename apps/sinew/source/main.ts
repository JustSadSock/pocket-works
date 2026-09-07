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
  'Процедурный риг связан с настоящей Babylon Skeleton/Bone-иерархией; игрок видит собственные ноги, торс, руки, меч и щит.',
  'Swept-контакты клинка различают касание, удар по телу, блок щитом и столкновение мечей; собственное тело имеет анатомический clearance для оружия.',
  'Масса и угловая скорость оружия влияют на устойчивость и отдачу корпуса, а graze больше не съедает следующий полноценный удар.',
  'AI использует тот же контроллер позы, телеграфирует замахи, защищается реальным щитом и реагирует на положение оружия игрока.'
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sinew-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
