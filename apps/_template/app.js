import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import {
  createStorage,
  isStandalone,
  registerAppServiceWorker,
  watchConnectivity
} from '../../shared/pwa-utils.js';

installMobileRuntime();

const storage = createStorage('__APP_SLUG__');
const action = document.querySelector('#primary-action');
const status = document.querySelector('#status');
let count = storage.get('interaction-count', 0);

function renderStatus(prefix = 'Ready') {
  const mode = isStandalone() ? 'standalone' : 'browser';
  const network = navigator.onLine ? 'online' : 'offline';
  status.value = `${prefix} · ${mode} · ${network} · interactions ${count}`;
}

action.addEventListener('click', () => {
  count += 1;
  storage.set('interaction-count', count);
  renderStatus('Interaction recorded');
});

watchConnectivity(() => renderStatus());
renderStatus();
registerAppServiceWorker('./sw.js');
