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
  fallback.style.cssText = 'position:absolute;inset:0;z-index:200;display:grid;place-content:center;gap:12px;padding:28px;background:#eee9dc;color:#172c3c;text-align:center';
  fallback.innerHTML = '<h1 style="margin:0;font:700 32px/1 Georgia,serif">Карта не загрузилась</h1><p style="margin:0;color:#50606a;line-height:1.45">Перезапустите приложение. Сохранённая кампания останется на устройстве.</p><a href="../../" style="min-height:48px;display:grid;place-items:center;border:2px solid #172c3c;text-decoration:none;font-weight:900;color:#172c3c">Вернуться в Pocket Works</a>';
  document.querySelector('[data-app-shell]')?.append(fallback);
}
