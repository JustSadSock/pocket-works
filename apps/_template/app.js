import {
  bindPointerGesture,
  installMobileRuntime
} from '../../shared/mobile-runtime.js';
import {
  createStorage,
  watchConnectivity
} from '../../shared/pwa-utils.js';

// serviceWorker.register('./sw.js') is owned by shared/update-manager.js.
installMobileRuntime();

const storage = createStorage('__APP_STORAGE_NAMESPACE__');
const status = document.querySelector('#status');

__PRESET_SCRIPT__

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});
