import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';

const parts = ['./engine/part-1.txt', './engine/part-2.txt', './engine/part-3.txt', './engine/part-4.txt'];
const status = document.querySelector('#yardNote');
status.textContent = 'Разворачиваем чертёжный двор…';

globalThis.__arsMachinaShared = { installMobileRuntime, createWorkshopMode, watchConnectivity };
let moduleUrl = '';
try {
  const sources = await Promise.all(parts.map(async (path) => {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Не удалось загрузить ${path}: ${response.status}`);
    return response.text();
  }));
  moduleUrl = URL.createObjectURL(new Blob([sources.join('\n')], { type: 'text/javascript' }));
  await import(moduleUrl);
} catch (error) {
  console.error('ARS MACHINA failed to start', error);
  status.textContent = 'Мастерская не открылась. Обнови приложение или очисти его данные в Workshop.';
  status.classList.remove('faded');
  document.querySelector('#runButton').disabled = true;
} finally {
  if (moduleUrl) URL.revokeObjectURL(moduleUrl);
  delete globalThis.__arsMachinaShared;
}
