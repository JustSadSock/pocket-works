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
const RUNTIME_VERSION = '1.1.6';
const paths = Array.from(
  { length: PARTS },
  (_, index) => `./runtime/part-${String(index).padStart(2, '0')}.txt?v=${RUNTIME_VERSION}`
);

try {
  const parts = await Promise.all(paths.map(async (path, index) => {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load ${path} (${response.status})`);
    const source = await response.text();
    if (!source.trim()) throw new Error(`Runtime part ${index} was empty`);
    return source;
  }));
  let source = parts.join('\n');
  if (!source.includes(`const APP_VERSION = '${RUNTIME_VERSION}'`)) {
    throw new Error(`Runtime version mismatch; expected ${RUNTIME_VERSION}`);
  }
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
  try {
    await import(moduleUrl);
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
} catch (error) {
  console.error('СГИБ failed to initialise', error);
  document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('is-visible'));
  const errorScreen = document.getElementById('errorScreen');
  const copy = document.getElementById('errorCopy');
  if (copy) copy.textContent = 'Перезагрузи приложение. Если ошибка повторится, открой Workshop Mode после следующего запуска.';
  errorScreen?.classList.add('is-visible');
}