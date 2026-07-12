import {
  bindPointerGesture,
  installMobileRuntime
} from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';

// serviceWorker.register('./sw.js') is owned by shared/update-manager.js.
installMobileRuntime();

const storage = createVersionedStore({
  namespace: '__APP_STORAGE_NAMESPACE__',
  version: 1,
  defaults: {}
});
const status = document.querySelector('#status');

__PRESET_SCRIPT__

createWorkshopMode({
  appName: '__APP_NAME__',
  version: '__APP_VERSION__',
  cachePrefix: '__APP_SLUG__-',
  storageNamespace: '__APP_STORAGE_NAMESPACE__',
  onReset() {
    storage.reset();
    window.dispatchEvent(new CustomEvent('appdatareset'));
  }
});

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});
