import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';

const appName = 'SIROCCO';
const version = '1.0.1';
const storageNamespace = 'pocket-works:sirocco';
const releaseNotes = [
  'Исправлен критический баг дальнего LOD: грубый terrain больше не перекрывает активные чанки и не накрывает камеру песчаным потолком.',
  'Дальний ландшафт теперь строится кольцом с гарантированным пустым центром вокруг игрока и корректно центрируется по активному чанку.',
  'Сломанные сохранения камеры из версии 1.0.0 автоматически сбрасываются через новую схему session-state.',
  'Вход в прогулку больше не зависит от успешной инициализации Web Audio: управление запускается сразу, а звук подключается отдельно.'
];

const runtime = installMobileRuntime();
runtime.setScrollLocked(true);
registerEnhancedUpdate({ appName, version: '1.0.1', releaseNotes });
createWorkshopMode({
  appName,
  version,
  cachePrefix: 'sirocco-',
  storageNamespace,
  onReset: () => location.reload()
});

void import('./main.js');
