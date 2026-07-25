import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';

installMobileRuntime();

const WORKSHOP_CONTRACT = Object.freeze({
  cachePrefix: 'clada-',
  storageNamespace: 'pocket-works:clada'
});

const runtimeParts = [
  './runtime/01-core.js',
  './runtime/02-life.js',
  './runtime/03-simulation.js',
  './runtime/04-history.js',
  './runtime/05-inspector.js',
  './runtime/06-views.js',
  './runtime/07-render.js',
  './runtime/08-controls.js',
  './runtime/09-advanced-loader.js'
];

for (const source of runtimeParts) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Не удалось загрузить ${source}`));
    document.head.append(script);
  });
}

createWorkshopMode({
  appName: 'КЛАДА',
  version: '2.1.0',
  cachePrefix: WORKSHOP_CONTRACT.cachePrefix,
  storageNamespace: WORKSHOP_CONTRACT.storageNamespace
});

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});
