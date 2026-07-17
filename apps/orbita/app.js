import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';

const STORAGE_NAMESPACE = 'pocket-works:orbita';
const STORAGE_KEYS = [`${STORAGE_NAMESPACE}:state`, `${STORAGE_NAMESPACE}:prefs`];

installMobileRuntime();
await import('./game.js');

createWorkshopMode({
  appName: 'ОРБИТА',
  version: '1.1.0',
  cachePrefix: 'orbita-',
  storageNamespace: 'pocket-works:orbita',
  onReset() {
    for (const key of STORAGE_KEYS) localStorage.removeItem(key);
    window.location.reload();
  }
});
