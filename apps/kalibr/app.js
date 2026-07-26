import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';

installMobileRuntime();
createWorkshopMode({
  appName: 'КАЛИБР',
  version: '2.0.0',
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

async function loadRuntimePack() {
  if (!globalThis.DecompressionStream) throw new Error('Браузер не поддерживает распаковку игрового runtime');
  const parts = await Promise.all([0, 1, 2, 3].map(async (index) => {
    const response = await fetch(`./game-pack-${index}.txt`);
    if (!response.ok) throw new Error(`Пакет ${index + 1} недоступен`);
    return response.text();
  }));
  const binary = atob(parts.join('').replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const source = await new Response(stream).text();
  new Function(source)();
}

try {
  await loadClassicScript('./game-part-1.js');
  await loadRuntimePack();
} catch (error) {
  console.error('КАЛИБР не запустился', error);
  const screen = document.getElementById('menuScreen');
  if (screen) screen.innerHTML = `<div class="fatal-error"><p>ОШИБКА ЗАПУСКА</p><h1>КАЛИБР НЕ ЗАРЯЖЕН</h1><span>${String(error?.message || error)}</span><button onclick="location.reload()">ПОВТОРИТЬ</button></div>`;
}
