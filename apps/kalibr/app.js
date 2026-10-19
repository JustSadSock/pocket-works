import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';

installMobileRuntime();
createWorkshopMode({
  appName: 'КАЛИБР',
  version: '2.0.1',
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
  for (let part = 1; part <= 6; part += 1) {
    await loadClassicScript(`./game-part-${part}.js`);
  }
} catch (error) {
  console.error('КАЛИБР не запустился', error);
  const screen = document.getElementById('menuScreen');
  if (screen) screen.innerHTML = `<div class="fatal-error"><p>ОШИБКА ЗАПУСКА</p><h1>КАЛИБР НЕ ЗАРЯЖЕН</h1><span>${String(error?.message || error)}</span><button onclick="location.reload()">ПОВТОРИТЬ</button></div>`;
}
