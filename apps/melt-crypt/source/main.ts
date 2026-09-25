import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'MELT//CRYPT';
const version = '3.0.0';
const storageNamespace = 'pocket-works:melt-crypt';
const releaseNotes = [
  "Combat Rebuild: стартовый GRAVE CLEAVER теперь фиксированный и вручную настроенный; все шесть weapon cores получили отдельные attack motion packages с anticipation, impact, follow-through и ограничением обычного удара до отзывчивого диапазона.",
  "Враги получили locomotion/attack/stagger/death-анимации, телеграфы и несколько типов смерти; encounter director закрывает комнату, выпускает противников волнами и открывает её после зачистки.",
  "Первая боевая комната гарантированно предлагает три разных оружия, каждый сундук тоже даёт выбор из трёх, а шанс обычного weapon drop повышен; лежащее оружие отмечено заметным beacon и показывает сравнение SPD/RNG/STG до поднятия.",
  "Перестроены game feel и звук: многослойные swing/impact/armor/parry/stagger/death SFX, combat pulse, шаги, более сильный event-only camera impulse, hit-stop, knockback, blood FX и execution payoff.",
  "HUD и изображение очищены: системные signatures/grammar скрыты из боя, карта гаснет во время encounter, уменьшены saturation/contrast/emissive, враги отделены по яркости от окружения; крипта расширена до 26 authored room modules без новых биомов."
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version: '3.0.0', releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'melt-crypt-', storageNamespace, onReset: () => location.reload() });

void import('./main.js');
