import { installMobileRuntime } from '../../shared/mobile-runtime.js';

installMobileRuntime();

const runtimeParts = ["./runtime/01-core.js", "./runtime/02-life.js", "./runtime/03-simulation.js", "./runtime/04-history.js", "./runtime/05-inspector.js", "./runtime/06-views.js", "./runtime/07-render.js", "./runtime/08-controls.js", "./runtime/09-evolution-v2.js"];
const livingRuntimeGroups = [["./runtime/v3/10-01.txt", "./runtime/v3/10-02.txt", "./runtime/v3/10-03.txt", "./runtime/v3/10-04.txt"], ["./runtime/v3/11-01.txt", "./runtime/v3/11-02.txt", "./runtime/v3/11-03-1.txt", "./runtime/v3/11-03-2.txt", "./runtime/v3/11-03-3.txt", "./runtime/v3/11-04.txt", "./runtime/v3/11-05-1.txt", "./runtime/v3/11-05-2.txt", "./runtime/v3/11-05-3.txt", "./runtime/v3/11-06.txt"], ["./runtime/v3/12-01.txt", "./runtime/v3/12-02.txt", "./runtime/v3/12-03.txt", "./runtime/v3/12-04.txt", "./runtime/v3/12-05.txt"], ["./runtime/v3/13-stability.txt"], ["./runtime/v3/14-diversification-core.js"], ["./runtime/v3/15-01.txt", "./runtime/v3/15-02.txt", "./runtime/v3/15-03.txt"], ["./runtime/v4/16-01.txt", "./runtime/v4/16-02.txt", "./runtime/v4/16-03.txt", "./runtime/v4/16-04.txt"], ["./runtime/v4/17-01.txt", "./runtime/v4/17-02.txt", "./runtime/v4/17-03.txt"]];

function loadClassicScript(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.onload = () => { script.remove(); resolve(); };
    script.onerror = () => { script.remove(); reject(new Error(`Не удалось загрузить ${source}`)); };
    document.head.append(script);
  });
}

async function loadLivingGroup(parts) {
  const responses = await Promise.all(parts.map((source) => fetch(source, { cache: 'no-store' })));
  const failed = responses.find((response) => !response.ok);
  if (failed) throw new Error(`Не удалось загрузить экологический модуль: ${failed.status}`);
  const source = (await Promise.all(responses.map((response) => response.text()))).join('');
  const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try { await loadClassicScript(blobUrl); }
  finally { URL.revokeObjectURL(blobUrl); }
}

try {
  for (const source of runtimeParts) await loadClassicScript(source);
  for (const group of livingRuntimeGroups) await loadLivingGroup(group);
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
