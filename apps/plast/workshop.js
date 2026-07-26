import { createWorkshopMode } from '../../shared/workshop-mode.js';

createWorkshopMode({
  appName: 'ПЛАСТ',
  version: '1.0.0',
  cachePrefix: 'plast-',
  storageNamespace: 'pocket-works:plast',
  onReset() {
    localStorage.removeItem('pocket-works:plast:world-v1');
    localStorage.removeItem('pocket-works:plast:settings-v1');
    window.dispatchEvent(new CustomEvent('appdatareset'));
    location.reload();
  }
});
