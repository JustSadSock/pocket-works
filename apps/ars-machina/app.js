import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';

for (const href of ['./joints.css', './v16.css', './codex-v20.css', './vision-v21.css']) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = href;
  document.head.append(stylesheet);
}

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
  './engine/part-11.txt',
  './engine/part-12.txt',
  './engine/part-13.txt',
  './engine/part-14.txt',
  './engine/part-15a.txt',
  './engine/part-15hub.txt',
  './engine/part-15b.txt',
  './engine/part-15c.txt',
  './engine/part-15drive.txt',
  './engine/part-15rack.txt',
  './engine/part-15explicit.txt',
  './engine/part-16a.txt',
  './engine/part-16b.txt',
  './engine/part-17a.txt',
  './engine/part-17b.txt',
  './engine/part-17repair.txt',
  './engine/part-18a.txt',
  './engine/part-18b.txt',
  './engine/part-18c.txt',
  './engine/part-19.txt',
  './engine/part-20.txt',
  './engine/part-21a.txt',
  './engine/part-21b.txt',
  './engine/part-21c.txt'
];
const status = document.querySelector('#yardNote');
status.textContent = 'Разворачиваем Codice delle Macchine…';

globalThis.__arsMachinaShared = { installMobileRuntime, createWorkshopMode, watchConnectivity };
let moduleUrl = '';
try {
  const sources = await Promise.all(parts.map(async (path) => {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Не удалось загрузить ${path}: ${response.status}`);
    return response.text();
  }));
  const source = sources.join('\n')
    .replace("const APP_VERSION = '1.2.0';", "const APP_VERSION = '2.1.0';")
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
