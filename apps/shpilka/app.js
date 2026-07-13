import { installMobileRuntime } from '../../shared/mobile-runtime.js';

installMobileRuntime();

const gameParts = [
  './game-core.js',
  './game-race.js',
  './game-render.js',
  './game-main.js'
];

for (const source of gameParts) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${source}`));
    document.head.append(script);
  });
}
