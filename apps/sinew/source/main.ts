import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SINEW';
const version = '1.7.0';
const storageNamespace = 'pocket-works:sinew';
const releaseNotes = [
  'Противник переведён на тот же ConstraintArm solver, что и игрок: контакт теперь физически уступает с обеих сторон.',
  'После блока и клинча AI сохраняет короткую память барьера, поэтому оружие не пытается мгновенно продавить ту же поверхность обратно.',
  'Финты больше не телепортируют меч к конечной позе удара: recovery начинается из реально достигнутой позиции замаха.',
  'Blender-меч, гарда, рукоять, навершие и полный щит теперь используются в runtime и синхронизированы с collision-якорями.',
  'Blender Asset Forge повторно сгенерировал combat kit с сужающимся клинком, ламеллярными рёбрами, латунными заклёпками и более детализированным щитом.',
  'Визуальный край Blender-щита связан с физическим радиусом, поэтому графика и контактная геометрия совпадают.',
  'Добавлен симметричный двухсторонний stress-test на тысячи шагов и повторных контактов.'
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sinew-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
