/*
 * Pocket Works contract markers for the split runtime loader.
 * The executable implementation lives in ./runtime/part-*.txt and is joined below.
 *
 * import { installMobileRuntime } from '../../shared/mobile-runtime.js';
 * import { createVersionedStore } from '../../shared/capabilities/storage.js';
 * import { createWorkshopMode } from '../../shared/workshop-mode.js';
 * import { watchConnectivity } from '../../shared/pwa-utils.js';
 * createWorkshopMode({
 *   storageNamespace: 'pocket-works:sgib',
 *   cachePrefix: 'sgib-'
 * });
 */
const PARTS = 14;
const RUNTIME_VERSION = '1.1.2';
const paths = Array.from(
  { length: PARTS },
  (_, index) => `./runtime/part-${String(index).padStart(2, '0')}.txt?v=${RUNTIME_VERSION}`
);

try {
  const parts = await Promise.all(paths.map(async (path) => {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load ${path} (${response.status})`);
    return response.text();
  }));
  let source = parts.join('');
  for (const relative of [
    '../../shared/mobile-runtime.js',
    '../../shared/capabilities/storage.js',
    '../../shared/workshop-mode.js',
    '../../shared/pwa-utils.js',
    './geometry.js'
  ]) {
    const absolute = JSON.stringify(new URL(relative, import.meta.url).href);
    source = source.replaceAll(`'${relative}'`, absolute).replaceAll(`"${relative}"`, absolute);
  }
  const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  await import(moduleUrl);
  URL.revokeObjectURL(moduleUrl);
} catch (error) {
  console.error('СГИБ failed to initialise', error);
  document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('is-visible'));
  const errorScreen = document.getElementById('errorScreen');
  const copy = document.getElementById('errorCopy');
  if (copy) copy.textContent = 'Перезагрузи приложение. Если ошибка повторится, открой Workshop Mode после следующего запуска.';
  errorScreen?.classList.add('is-visible');
}