import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SINEW';
const version = '1.3.0';
const storageNamespace = 'pocket-works:sinew';
const releaseNotes = [
  'Полностью убрана анимационная классификация ударов: быстрый жест теперь прикладывает импульс к физической цепи плечо–локоть–кисть–меч, а траектория рождается из ограничений и инерции.',
  'Обе руки игрока переведены на position-based constraint модель с фиксированной длиной сегментов; блок, промах и столкновение больше не обязаны завершаться одной заранее заданной recovery-анимацией.',
  'Один правый жест разделён на два канала: медленный drag почти полностью управляет камерой, а быстрый flick отдаёт большую часть дополнительной энергии руке, не разворачивая взгляд на пол-экрана.',
  'Щит получил собственную тяжёлую constraint-цепь и реагирует на угрозу независимо от меча; контактные импульсы теперь напрямую толкают физические цепи оружия и щита.',
  'Добавлен новый headless constraint-sparring stress test: проверяются фиксированные длины руки/оружия, разнообразие траекторий, скорость и 120 секунд синтетического боя без накопления растяжения или численного дрейфа.',
  'Старый active-combat/muscle-motion слой больше не подключается к runtime: положение рук имеет один физический источник истины вместо нескольких конкурирующих сглаживателей.'
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sinew-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
