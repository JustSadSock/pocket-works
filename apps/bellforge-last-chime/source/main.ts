import './styles.css';
import './puzzle-assist.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { installPuzzleAssist } from './puzzle-assist.js';

const appName = 'BELLFORGE // THE LAST CHIME';
const version = '1.2.0';
const storageNamespace = 'pocket-works:bellforge-last-chime';
const releaseNotes = [
  'Резонансные головоломки теперь однозначно решаются: восемь разнесённых тонов, эталонная последовательность и визуальный спектр.',
  'Управление камерой и multi-touch дополнительно стабилизированы для горизонтального iPhone.',
  'Кварталы получили более связную визуальную навигацию, переходы и дополнительные Blender-детали.',
  'Исправлены найденные коллизии, читаемость интеракций и несколько слабых состояний игрового маршрута.'
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version, releaseNotes });
createWorkshopMode({
  appName,
  version,
  cachePrefix: 'bellforge-last-chime-',
  storageNamespace,
  onReset: () => location.reload()
});
installPuzzleAssist();

void import('./game.js');
