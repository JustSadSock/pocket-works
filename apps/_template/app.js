import {
  bindPointerGesture,
  installMobileRuntime
} from '../../shared/mobile-runtime.js';
import {
  createStorage,
  watchConnectivity
} from '../../shared/pwa-utils.js';

installMobileRuntime();

const storage = createStorage('__APP_STORAGE_NAMESPACE__');
const status = document.querySelector('#status');

__PRESET_SCRIPT__

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('__APP_NAME__ service worker registration failed', error);
    });
  });
}
