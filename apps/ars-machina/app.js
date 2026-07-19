import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';

const visualStyles = document.createElement('link');
visualStyles.rel = 'stylesheet';
visualStyles.href = './joints.css';
document.head.append(visualStyles);

const parts = [
  './engine/part-1.txt',
  './engine/part-2.txt',
  './engine/part-3.txt',
  './engine/part-4.txt',
  './engine/part-5.txt',
  './engine/part-6.txt',
  './engine/part-7.txt',
  './engine/part-8.txt',
  './engine/part-9.txt',
  './engine/part-10.txt',
  './engine/part-11.txt'
];
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
  const source = sources.join('\n')
    .replace("const APP_VERSION = '1.2.0';", "const APP_VERSION = '1.5.0';")
    .replace(
      'localStorage.removeItem(PREFS_KEY);',
      `localStorage.removeItem(PREFS_KEY);\n    localStorage.removeItem('pocket-works:ars-machina:library');\n    localStorage.removeItem('pocket-works:ars-machina:current-model');\n    if (typeof setCurrentModelIdentity === 'function') setCurrentModelIdentity(null, 'Новая модель');\n    if (typeof renderLibraryList === 'function') renderLibraryList();`
    );
  moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
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
