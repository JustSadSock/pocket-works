import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { compressJson, decompressJson } from './platform/compression.js';
import { loadCladaRuntime } from './platform/runtime-loader.js';
import { createSimulationClient } from './platform/simulation-client.js';
import { createCladaStorageBridge } from './platform/storage.js';

installMobileRuntime();

for (const href of ['./field-journal.css', './living-planet.css', './observable-life.css', './genetics.css', './life-trace.css']) {
  if (document.querySelector(`link[href="${href}"]`)) continue;
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = href;
  document.head.append(style);
}

const runtimeParts = [
  './runtime/01-core.js', './runtime/02-life.js', './runtime/03-simulation.js', './runtime/04-history.js',
  './runtime/05-inspector.js', './runtime/06-views.js', './runtime/07-render.js', './runtime/08-controls.js', './runtime/09-evolution-v2.js'
];
const livingRuntimeGroups = [
  ['./runtime/v3/10-01.txt', './runtime/v3/10-02.txt', './runtime/v3/10-03.txt', './runtime/v3/10-04.txt'],
  ['./runtime/v3/11-01.txt', './runtime/v3/11-02.txt', './runtime/v3/11-03-1.txt', './runtime/v3/11-03-2.txt', './runtime/v3/11-03-3.txt', './runtime/v3/11-04.txt', './runtime/v3/11-05-1.txt', './runtime/v3/11-05-2.txt', './runtime/v3/11-05-3.txt', './runtime/v3/11-06.txt'],
  ['./runtime/v3/12-01.txt', './runtime/v3/12-02.txt', './runtime/v3/12-03.txt', './runtime/v3/12-04.txt', './runtime/v3/12-05.txt'],
  ['./runtime/v3/13-stability.txt'],
  ['./runtime/v3/14-diversification-core.js'],
  ['./runtime/v3/15-01.txt', './runtime/v3/15-02.txt', './runtime/v3/15-03.txt'],
  ['./runtime/v4/16-01.txt', './runtime/v4/16-02.txt', './runtime/v4/16-03.txt', './runtime/v4/16-04.txt'],
  ['./runtime/v4/17-01.txt', './runtime/v4/17-02.txt', './runtime/v4/17-03.txt'],
  ['./runtime/v4/18-field-journal-core.js'],
  ['./runtime/v4/19-01.txt', './runtime/v4/19-02.txt', './runtime/v4/19-03.txt'],
  ['./runtime/v4/20-01.txt', './runtime/v4/20-02.txt', './runtime/v4/20-03.txt'],
  ['./runtime/v4/21-01.txt', './runtime/v4/21-02.txt', './runtime/v4/21-03.txt'],
  ['./runtime/v4/22-01.txt', './runtime/v4/22-02-1.txt', './runtime/v4/22-02-2.txt', './runtime/v4/22-02-3.txt', './runtime/v4/22-03-1.txt', './runtime/v4/22-03-2.txt', './runtime/v4/22-03-3.txt', './runtime/v4/22-04-1.txt', './runtime/v4/22-04-2.txt', './runtime/v4/22-04-3.txt', './runtime/v4/22-05-1.txt', './runtime/v4/22-05-2.txt', './runtime/v4/22-05-3.txt'],
  ['./runtime/v4/23-worker-storage.js'],
  ['./runtime/v5/24-01.txt', './runtime/v5/24-02.txt', './runtime/v5/24-03.txt', './runtime/v5/24-04.txt', './runtime/v5/24-05.txt'],
  ['./runtime/v5/25-01.txt', './runtime/v5/25-02.txt'],
  ['./runtime/v5/26-01.txt', './runtime/v5/26-02.txt', './runtime/v5/26-03.txt', './runtime/v5/26-04.txt'],
  ['./runtime/v5/27-01.txt', './runtime/v5/27-02.txt']
];

const services = {
  storage: null,
  simulation: null,
  compression: { compressJson, decompressJson }
};
globalThis.CladaRuntimeServices = services;

try {
  services.storage = await createCladaStorageBridge();
} catch (error) {
  console.warn('КЛАДА: IndexedDB не запустилась, включён аварийный backend', error);
}

try {
  services.simulation = await createSimulationClient();
} catch (error) {
  console.warn('КЛАДА: Worker не запустился, модель останется в основном потоке', error);
}

try {
  await loadCladaRuntime({ scripts: runtimeParts, groups: livingRuntimeGroups });
} catch (error) {
  console.error('КЛАДА: ошибка запуска', error);
  const empty = document.querySelector('#emptyState');
  if (empty) {
    empty.hidden = false;
    empty.querySelector('strong').textContent = 'Лаборатория не загрузилась';
    empty.querySelector('span').textContent = 'Перезапусти приложение. Сохранённый мир останется на устройстве.';
    empty.querySelector('button').hidden = true;
  }
}

addEventListener('pagehide', () => services.simulation?.terminate?.(), { once: true });
