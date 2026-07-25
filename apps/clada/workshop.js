import { createWorkshopMode } from '../../shared/workshop-mode.js';

const STORAGE_NAMESPACE = 'pocket-works:clada';

createWorkshopMode({
  appName: 'КЛАДА',
  version: '3.1.0',
  cachePrefix: 'clada-',
  storageNamespace: STORAGE_NAMESPACE,
  onReset: async () => {
    try {
      localStorage.removeItem('pocket-works:clada:state-v1');
      localStorage.removeItem('pocket-works:clada:settings');
    } finally {
      location.reload();
    }
  }
});
