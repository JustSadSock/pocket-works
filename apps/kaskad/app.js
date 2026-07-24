import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';

installMobileRuntime();

window.__KASKAD_DEPS__ = { createVersionedStore, createWorkshopMode, watchConnectivity };

const partUrls = [
  './engine-part-01.txt',
  './engine-part-02.txt',
  './engine-part-03.txt',
  './engine-part-04.txt',
  './engine-part-05.txt',
  './engine-part-06.txt'
];

try {
  const responses = await Promise.all(partUrls.map((url) => fetch(url)));
  const failed = responses.find((response) => !response.ok);
  if (failed) throw new Error(`Не удалось загрузить движок: ${failed.status}`);
  const parts = await Promise.all(responses.map((response) => response.text()));
  const prelude = 'const { createVersionedStore, createWorkshopMode, watchConnectivity } = window.__KASKAD_DEPS__;\n';
  const moduleUrl = URL.createObjectURL(new Blob([prelude, ...parts], { type: 'text/javascript' }));
  try {
    await import(moduleUrl);
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
} catch (error) {
  console.error('KASKAD startup failed', error);
  const stage = document.querySelector('#stage-empty');
  if (stage) {
    stage.hidden = false;
    stage.innerHTML = '<strong>Движок не загрузился</strong><span>Перезапусти приложение. Локальная сцена сохранена.</span>';
  }
}
