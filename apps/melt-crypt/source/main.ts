import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'MELT//CRYPT';
const version = '1.1.0';
const storageNamespace = 'pocket-works:melt-crypt';
const releaseNotes = [
  "Исправлено вертикальное управление камерой: жест вверх теперь поднимает взгляд, жест вниз — опускает.",
  "Переработаны коллизии дверных проёмов и камеры: расширены проходы, убраны лишние коллизии пола/потолка и снижено зацепление за стыки соседних комнат.",
  "HUD стал компактнее и чище, а подземелья получили больше цветных декоративных объектов, ориентиров и более информативную мини-карту.",
  "Расширена процедурная фауна и game feel: новые силуэты и мутации монстров, покачивание/наклоны, head-bob, recoil, hit-shake и более выразительный dodge."
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version: '1.1.0', releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'melt-crypt-', storageNamespace, onReset: () => location.reload() });

void import('./main.js');
