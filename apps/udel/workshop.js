import { createWorkshopMode } from '../../shared/workshop-mode.js';

const workshop = createWorkshopMode({
  appName: 'УДЕЛ',
  version: '1.0.0',
  storageNamespace: 'pocket-works:udel',
  cachePrefix: 'udel-',
  onReset() {
    localStorage.removeItem('pocket-works:udel:state');
    localStorage.removeItem('pocket-works:udel:settings');
    window.location.reload();
  }
});

window.__UDEL_WORKSHOP__ = workshop;
