import { bindPointerGesture, installMobileRuntime } from '../../shared/mobile-runtime.js';

globalThis.__SferyRuntime = { bindPointerGesture, installMobileRuntime };

const PARTS = [
  './app-part-01.txt',
  './app-part-02.txt',
  './app-part-03.txt',
  './app-part-04.txt',
  './app-part-05.txt'
];

try {
  const sources = await Promise.all(PARTS.map(async (path) => {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Не удалось загрузить ${path}: ${response.status}`);
    return response.text();
  }));
  const url = URL.createObjectURL(new Blob([sources.join('')], { type: 'text/javascript' }));
  try { await import(url); } finally { URL.revokeObjectURL(url); delete globalThis.__SferyRuntime; }
} catch (error) {
  console.error('СФЕРЫ: запуск не удался', error);
  const fallback = document.createElement('section');
  fallback.className = 'fatal-state';
  fallback.innerHTML = '<h1>Карта не загрузилась</h1><p>Перезапустите приложение. Сохранённая кампания останется на устройстве.</p><a href="../../">Вернуться в Pocket Works</a>';
  document.querySelector('[data-app-shell]')?.append(fallback);
}
