import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import shard01 from './engine-shard-01.js';
import shard02 from './engine-shard-02.js';
import shard03 from './engine-shard-03.js';
import shard04 from './engine-shard-04.js';
import shard05 from './engine-shard-05.js';
import shard06 from './engine-shard-06.js';
import shard07 from './engine-shard-07.js';
import shard08 from './engine-shard-08.js';
import shard09 from './engine-shard-09.js';

const APP_VERSION = '2.0.0';
const STORAGE_NAMESPACE = 'pocket-works:clade-lab';
const CACHE_PREFIX = 'clade-lab-';

installMobileRuntime();

const storage = createVersionedStore({
  namespace: STORAGE_NAMESPACE,
  version: 2,
  defaults: { worldV2: null },
  validate(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }
});

createWorkshopMode({
  appName: 'КЛАДА',
  version: APP_VERSION,
  cachePrefix: 'clade-lab-',
  storageNamespace: STORAGE_NAMESPACE,
  onReset() {
    storage.reset();
    window.dispatchEvent(new CustomEvent('appdatareset'));
  }
});

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function inflateEngine() {
  if (typeof DecompressionStream !== 'function') throw new Error('Браузер не поддерживает распаковку локального движка.');
  const compressed = decodeBase64([shard01, shard02, shard03, shard04, shard05, shard06, shard07, shard08, shard09].join(''));
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

async function boot() {
  const loading = document.querySelector('#loadingScreen');
  try {
    const source = await inflateEngine();
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
      const engine = await import(url);
      await engine.start({ storage, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches });
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.error('КЛАДА не запустилась', error);
    if (loading) loading.innerHTML = '<div class="loading-error"><b>Лаборатория не запустилась</b><p>Данные сохранены. Перезапустите приложение или очистите данные через Workshop.</p><button type="button" data-workshop-trigger data-native-press>Открыть Workshop</button></div>';
  }
}

boot();
