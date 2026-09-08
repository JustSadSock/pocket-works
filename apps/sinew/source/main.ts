import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName='SINEW';
const version='1.5.0';
const storageNamespace='pocket-works:sinew';
const releaseNotes=[
  'Щиты и клинки теперь являются постоянными физическими барьерами: collision решается каждый кадр, а cooldown применяется только к звуку и FX.',
  'Медленное давление мечом больше не проходит сквозь щит: контакт проецирует клинок обратно на поверхность и передаёт давление в кисть, локоть и плечо.',
  'Рабочая зона рук существенно расширена по вертикали: можно опускать меч к ногам, поднимать его в high guard, держать щит у бедра или над головой.',
  'Высота боевой зоны теперь следует за углом взгляда, а быстрый вертикальный flick остаётся ударным импульсом внутри выбранной зоны.',
  'Базовая чувствительность камеры и жестов увеличена примерно в полтора раза; максимальный пользовательский диапазон чувствительности также расширен.',
  'Добавлен stress-test повторных физических контактов: проверяется, что оружие уступает давлению без растяжения костей и численного разлёта.'
];
const runtime=installMobileRuntime();runtime.setScrollLocked(true);registerEnhancedUpdate({appName,version,releaseNotes});createWorkshopMode({appName,version,cachePrefix:'sinew-',storageNamespace,onReset:()=>location.reload()});void import('./main.js');
