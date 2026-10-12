// @ts-nocheck
import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';
import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
const RELEASE_NOTES=[
  "Исправлено автосохранение: состояние снова сохраняется каждые 15 секунд, при уходе в фон и после открытия или импорта мира.",
  "Исправлены мультитач, pointercancel и скрытые инструменты: pinch больше не засоряет Undo и IndexedDB, а стёртые стены, генераторы и стоки действительно исчезают.",
  "Исправлены задачи, перемотка, импорт датчиков и пользовательские вещества: контекст корректно сбрасывается, импорт не уничтожает личную библиотеку, коллизии ID больше не ломают материалы.",
  "Исправлена физика газов и тестовая камера синтеза; подключены штатные Pocket Works Mobile Runtime, обновления и Workshop Mode."
];
installMobileRuntime();
registerEnhancedUpdate({ appName: 'ВЕЩЕСТВО', version: '1.0.1', releaseNotes: RELEASE_NOTES });
globalThis.__veshchestvoWorkshop=createWorkshopMode({ appName: 'ВЕЩЕСТВО', version: '1.0.1', cachePrefix: 'veshchestvo-', storageNamespace: 'pocket-works:veshchestvo', onReset: () => location.reload() });
await import('./ui-runtime.ts');
