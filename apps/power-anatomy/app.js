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
  namespace: 'pocket-works:power-anatomy',
  version: 1,
  defaults: {}
});
const status = document.querySelector('#status');

const action = document.querySelector('#primary-action');
let count = storage.get('interaction-count', 0);
const render = (prefix = 'Ready') => {
  status.value = `${prefix} · interactions ${count}`;
};
action.addEventListener('click', () => {
  count += 1;
  storage.set('interaction-count', count);
  render('Recorded');
});
render();

createWorkshopMode({
  appName: 'Анатомия власти',
  version: '0.1.0',
  cachePrefix: 'power-anatomy-',
  storageNamespace: 'pocket-works:power-anatomy',
  onReset() {
    storage.reset();
    window.dispatchEvent(new CustomEvent('appdatareset'));
  }
});

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});
