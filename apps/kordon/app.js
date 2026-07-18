import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';

const STORAGE_NAMESPACE = 'pocket-works:kordon';
const STORAGE_KEYS = [`${STORAGE_NAMESPACE}:state`, `${STORAGE_NAMESPACE}:prefs`];

installMobileRuntime();
await import('./game.js');

createWorkshopMode({
  appName: 'КОРДОН',
  version: '1.1.0',
  cachePrefix: 'kordon-',
  storageNamespace: STORAGE_NAMESPACE,
  onReset() {
    for (const key of STORAGE_KEYS) localStorage.removeItem(key);
    window.location.reload();
  }
});
