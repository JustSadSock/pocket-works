import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SIROCCO';
const version = '1.2.1';
const storageNamespace = 'pocket-works:sirocco';
const releaseNotes = [
  'Камера вынесена вперёд относительно направления тела, а не направления взгляда, и получила больший near clip: внутренность головы и шеи больше не должна попадать в first-person обзор при поворотах и взгляде вниз.',
  'Персонаж получил раздельные материалы и детали: тёплая кожа, светлая льняная тоба, более тёмные складки, красный кушак и головная повязка, тёмные брюки, кожаная обувь и отдельные видимые кисти.',
  'Убран постоянный тёмный круг вокруг игрока: локальный high-detail sand mesh больше не дублирует всю область рендера и создаётся только в ячейках, где песок действительно был деформирован.',
  'Ходьба по песку стала мягче: снижена жёсткость разгона, добавлены сопротивление грунта и небольшое физическое погружение тела в песок в зависимости от скорости и уклона.'
];
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version: '1.2.1', releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sirocco-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
