/*
 * Pocket Works contract markers for the split runtime loader.
 * The executable implementations live in ./runtime/part-*.txt and are joined below.
 *
 * import { installMobileRuntime } from '../../shared/mobile-runtime.js';
 * import { createWorkshopMode } from '../../shared/workshop-mode.js';
 * createWorkshopMode({
 *   storageNamespace: 'pocket-works:kromka',
 *   cachePrefix: 'kromka-'
 * });
 */
const PARTS = 5;
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
    '../../shared/capabilities/motion.js',
    '../../shared/capabilities/storage.js',
    '../../shared/workshop-mode.js'
  ]) {
    source = source.replaceAll(`"${relative}"`, JSON.stringify(new URL(relative, import.meta.url).href));
  }
  const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  await import(moduleUrl);
  URL.revokeObjectURL(moduleUrl);
} catch (error) {
  console.error('KROMKA failed to initialise', error);
  const message = document.querySelector('#liveMessage');
  const startButton = document.querySelector('#randomRunButton');
  if (message) {
    message.textContent = 'ОШИБКА ПЕЧАТИ';
    message.classList.add('is-visible');
  }
  if (startButton) {
    startButton.disabled = true;
    startButton.textContent = 'ПЕРЕЗАГРУЗИТЬ';
    startButton.addEventListener('click', () => location.reload(), { once: true });
  }
}
