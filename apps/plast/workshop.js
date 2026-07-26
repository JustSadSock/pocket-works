import { createWorkshopMode } from '../../shared/workshop-mode.js';

createWorkshopMode({
  appName: 'ПЛАСТ',
  version: '1.1.1',
  cachePrefix: 'plast-',
  storageNamespace: 'pocket-works:plast',
  onReset() {
    sessionStorage.setItem('pocket-works:plast:reset-on-load', '1');
    localStorage.removeItem('pocket-works:plast:world:v1');
    localStorage.removeItem('pocket-works:plast:settings:v1');
    localStorage.removeItem('pocket-works:plast:controls-seen:v1');
    window.dispatchEvent(new CustomEvent('appdatareset'));
    location.reload();
  }
});
