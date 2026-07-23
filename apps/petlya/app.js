import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import { CHAPTERS, LEVELS, MOVES, parseLevel, isEchoOnlyPlate } from './levels.js';

globalThis.__PETLYA_DEPS__ = { installMobileRuntime, createWorkshopMode, watchConnectivity, CHAPTERS, LEVELS, MOVES, parseLevel, isEchoOnlyPlate };

function loadClassic(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${source}`));
    document.head.append(script);
  });
}

try {
  await loadClassic('./game-core.js');
  await loadClassic('./game-runtime.js');
} catch (error) {
  console.error(error);
  document.getElementById('fatal-error')?.removeAttribute('hidden');
}
