import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'MELT//CRYPT';
const version = '2.0.0';
const storageNamespace = 'pocket-works:melt-crypt';
const releaseNotes = [
  "Полностью заменён старый генератор мобов на читаемую модульную грамматику: 6 тел, 5 locomotion-пакетов, 8 arm/weapon-модулей, 6 защит и 8 видимых мутаций; последние 30 enemy signatures защищены от близких повторов.",
  "Стрельба заменена мобильной melee-системой ATTACK / DODGE / WEAPON SKILL: tap/hold атаки, weapon-specific reach/arc/cadence/recovery/combo, dash attacks, мягкий aim assist, parry/ward/hook/projectile/AoE/phase cut/execution/pulse.",
  "Добавлен генератор оружия из 6 cores, 10 рабочих голов и 8 skills: длина, масса, крюк, guard, glowing core, trait и skill видны на модели и реально меняют правила боя; сундуки и часть врагов создают новые weapon signatures.",
  "Игрок переведён на swept capsule-controller со step-height и auto-sprint; dodge и skills больше не туннелят сквозь стены. Добавлены hit-stop, event camera impulse, stagger, knockback, blood FX и читаемые weak points/armor.",
  "Мир зафиксирован в одной тёмно-красной эстетике и получил 18 архитектурных room modules. Roguelike-реликвии и meta-прогрессия теперь в первую очередь открывают новые механики и расширяют словарь генераторов, а не раздают процентные статы."
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version: '2.0.0', releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'melt-crypt-', storageNamespace, onReset: () => location.reload() });

void import('./main.js');
