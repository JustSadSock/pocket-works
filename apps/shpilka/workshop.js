import { createWorkshopMode } from '../../shared/workshop-mode.js';

const workshop = createWorkshopMode({
  appName: 'ШПИЛЬКА',
  version: '1.0.0',
  storageNamespace: 'pocket-works:shpilka',
  cachePrefix: 'shpilka-',
  onReset() {
    localStorage.removeItem('pocket-works:shpilka:state:v1');
    window.location.reload();
  }
});

window.__SHPILKA_WORKSHOP__ = workshop;
