import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'MELT//CRYPT';
const version = '1.0.0';
const storageNamespace = 'pocket-works:melt-crypt';
const releaseNotes = [
  "Добавлен законченный first-person roguelike-цикл: процедурные этажи, бой, зачистка комнат, выход на следующий уровень, смерть и новая попытка.",
  "Каждый монстр получает процедурный геном внешности и поведения: архетип тела, палитру, рога, глаза, конечности, ауру, скорость, здоровье, размер и одну из нескольких способностей.",
  "Добавлены психоделический пиксельный рендер, кислотное освещение, кристаллы, динамический туман, экранные эффекты от зелий и визуальные реакции на урон.",
  "Добавлены реликвии, зелья, странные находки, сундуки, кодекс открытий, сохранение прогресса и полноценное мобильное/десктопное управление."
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version: '1.0.0', releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'melt-crypt-', storageNamespace, onReset: () => location.reload() });

void import('./main.js');
