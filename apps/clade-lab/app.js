import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import payloadOne from './engine-payload-1.js';
import payloadTwo from './engine-payload-2.js';
import payloadThree from './engine-payload-3.js';

installMobileRuntime();

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

  const encoded = payloadOne + payloadTwo + payloadThree;
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

unpackEngine().catch(showFatalError);
