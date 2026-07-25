import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import payload01 from './engine-shard-01.js';
import payload02 from './engine-shard-02.js';
import payload03 from './engine-shard-03.js';
import payload04 from './engine-shard-04.js';
import payload05 from './engine-shard-05.js';
import payload06 from './engine-shard-06.js';
import payload07 from './engine-shard-07.js';
import payload08 from './engine-shard-08.js';
import payload09 from './engine-shard-09.js';

installMobileRuntime();

const WORKSHOP_CONTRACT = Object.freeze({
  cachePrefix: 'clade-lab-',
  storageNamespace: 'pocket-works:clade-lab'
});

function showFatalError(error) {
  console.error(error);
  const loading = document.querySelector('#loadingScreen');
  if (!loading) return;
  loading.classList.remove('is-hidden');
  loading.innerHTML = `
    <div class="loading-mark" aria-hidden="true"><span></span><span></span><span></span></div>
    <p>Лаборатория не смогла запустить симуляцию.</p>
    <button type="button" data-native-press>Перезапустить</button>
  `;
  loading.querySelector('button')?.addEventListener('click', () => window.location.reload());
}

async function unpackEngine() {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('This browser does not support the offline simulation decoder.');
  }
  const encoded = [payload01, payload02, payload03, payload04, payload05, payload06, payload07, payload08, payload09].join('');
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const source = await new Response(stream).text();
  const start = new Function(
    'createVersionedStore',
    'createWorkshopMode',
    'watchConnectivity',
    `${source}\n//# sourceURL=clade-lab-engine.js`
  );
  start(createVersionedStore, createWorkshopMode, watchConnectivity);
}

void WORKSHOP_CONTRACT;
unpackEngine().catch(showFatalError);
