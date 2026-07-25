import { installMobileRuntime } from '../../shared/mobile-runtime.js';

installMobileRuntime();

const runtimeParts = [
  './runtime/01-core.js',
  './runtime/02-life.js',
  './runtime/03-simulation.js',
  './runtime/04-history.js',
  './runtime/05-inspector.js',
  './runtime/06-views.js',
  './runtime/07-render.js',
  './runtime/08-controls.js',
  './runtime/09-evolution-v2.js'
];

try {
  for (const source of runtimeParts) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = source;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Не удалось загрузить ${source}`));
      document.head.append(script);
    });
  }
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
