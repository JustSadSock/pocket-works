import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';

installMobileRuntime();
createWorkshopMode({
  appName: 'КАЛИБР',
  version: '1.0.0',
  cachePrefix: 'kalibr-',
  storageNamespace: 'pocket-works:kalibr'
});

const loadClassicScript = (source) => new Promise((resolve, reject) => {
  const script = document.createElement('script');
  script.src = source;
  script.async = false;
  script.onload = resolve;
  script.onerror = () => reject(new Error(`Не удалось загрузить ${source}`));
  document.head.append(script);
});

try {
  for (const source of [
    './game-part-1.js',
    './game-part-2.js',
    './game-part-3.js',
    './game-part-4.js',
    './game-part-5.js',
    './game-part-6.js'
  ]) await loadClassicScript(source);
} catch (error) {
  console.error('КАЛИБР не запустился', error);
  const screen = document.getElementById('menuScreen');
  if (screen) screen.innerHTML = `<div style="margin:auto;max-width:620px;padding:32px"><p style="color:#f2b84b;font-weight:900">ОШИБКА ЗАПУСКА</p><h1 style="font-size:48px;margin:.2em 0">КАЛИБР НЕ ЗАРЯЖЕН</h1><p>${String(error?.message || error)}</p><button onclick="location.reload()" style="margin-top:20px;padding:14px 22px;border:0;background:#f2b84b;font-weight:900">ПОВТОРИТЬ</button></div>`;
}
