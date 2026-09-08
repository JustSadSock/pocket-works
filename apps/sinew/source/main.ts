import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SINEW';
const version = '1.4.0';
const storageNamespace = 'pocket-works:sinew';
const releaseNotes = [
  'Полностью переделана нейтральная стойка: меч больше не лежит горизонтально перед противником — кисть находится у нижних рёбер, а остриё угрожает линии лица и груди.',
  'Щит опущен из поля зрения и вынесен влево от центральной линии; круглый щит теперь держится под небольшим углом, а не как вертикальная стена перед глазами.',
  'Противник получил ту же боевую логику стойки: компактный guard, живое дыхание, более естественные замахи, выпады и возврат оружия после удара.',
  'Добавлены микродвижения стойки от дыхания и движения ног без заранее записанного idle-клипа — оружие и руки остаются частью constraint-физики.',
  'Визуальный слой стал цветнее: щиты получили окрашенное поле в цветах бойца, сохранены отдельные дерево, кожа, ткань и металл; добавлены пояс и дополнительные детали экипировки.'
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sinew-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
