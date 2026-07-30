import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { deleteCladaDatabase } from './platform/storage.js';

const STORAGE_NAMESPACE = 'pocket-works:clada';

createWorkshopMode({
  appName: 'КЛАДА',
  version: '5.0.0',
  cachePrefix: 'clada-',
  storageNamespace: STORAGE_NAMESPACE,
  onReset: async () => {
    try {
      await globalThis.CladaRuntimeServices?.storage?.removeWorld?.();
      await deleteCladaDatabase();
      localStorage.removeItem('pocket-works:clada:state-v1');
      localStorage.removeItem('pocket-works:clada:settings');
    } finally {
      location.reload();
    }
  }
});
