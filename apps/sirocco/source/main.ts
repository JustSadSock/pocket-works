import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SIROCCO';
const version = '1.7.0';
const storageNamespace = 'pocket-works:sirocco';
const releaseNotes = [
  'Ветер теперь единый для звука, низких песчаных струй, дымки и вторичного движения одежды.',
  'Свежие рыхлые валики следов понемногу переносятся по ветру, а глубокие впадины постепенно смягчаются наносимым песком.',
  'Добавлен отдельный низкий слой ветрового песка, который появляется только во время заметных порывов.',
  'Presence layer имеет собственный ограниченный erosion budget и не вмешивается в основной terrain/locomotion loop.',
  'Node + Chromium/WebKit QA отдельно проверяет gust-state, перенос рыхлого песка, штиль и mobile landscape rendering.'
];
const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({ appName, version, cachePrefix: 'sirocco-', storageNamespace, onReset: () => location.reload() });
void import('./main.js');
