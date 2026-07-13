/*
 * Pocket Works contract markers for the split runtime loader.
 * The executable implementation lives in ./runtime/part-*.txt and is joined below.
 *
 * import { installMobileRuntime } from '../../shared/mobile-runtime.js';
 * import { createVersionedStore } from '../../shared/capabilities/storage.js';
 * import { createWorkshopMode } from '../../shared/workshop-mode.js';
 * createWorkshopMode({
 *   storageNamespace: 'pocket-works:kontur',
 *   cachePrefix: 'kontur-'
 * });
 */
const PARTS = 7;
const paths = Array.from({ length: PARTS }, (_, index) => `./runtime/part-${String(index).padStart(2, '0')}.txt`);

try {
  const parts = await Promise.all(paths.map(async (path) => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Failed to load ${path} (${response.status})`);
    return response.text();
  }));
  let source = parts.join('');
  for (const relative of [
    '../../shared/mobile-runtime.js',
    '../../shared/capabilities/storage.js',
    '../../shared/workshop-mode.js'
  ]) {
    const absolute = JSON.stringify(new URL(relative, import.meta.url).href);
    source = source.replaceAll(`'${relative}'`, absolute).replaceAll(`"${relative}"`, absolute);
  }
  const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  await import(moduleUrl);
  URL.revokeObjectURL(moduleUrl);
} catch (error) {
  console.error('КОНТУР failed to initialise', error);
  const status = document.querySelector('#statusStrip');
  const startButton = document.querySelector('#newRunButton');
  if (status) {
    status.textContent = 'ОШИБКА ЗАПУСКА — ПЕРЕЗАГРУЗИ ПРИЛОЖЕНИЕ';
    status.dataset.tone = 'danger';
  }
  if (startButton) {
    startButton.disabled = false;
    startButton.querySelector('span').textContent = 'ПЕРЕЗАГРУЗИТЬ';
    startButton.addEventListener('click', () => location.reload(), { once: true });
  }
}
