import { installMobileRuntime } from '../../shared/mobile-runtime.js';

installMobileRuntime();

const VERSION = '2.7.0';
const gameParts = [
  ...Array.from({ length: 11 }, (_, index) => `./engine-v2-${String(index + 1).padStart(2, '0')}.js`),
  './engine-v2-stability.js',
  './engine-v2-advanced.js',
  './engine-v2-advanced-fixes.js',
  './engine-v2-23-ui.js',
  './engine-v2-23.js',
  './engine-v2-23-fixes.js',
  './engine-v2-24.js',
  './engine-v2-25-ai.js',
  './engine-v2-25-race.js',
  './engine-v2-25-1.js',
  './engine-v2-25-contacts.js',
  './engine-v2-25-wall.js',
  './engine-v2-26-career.js',
  './engine-v2-26-racecraft.js',
  './engine-v2-26-landmarks.js',
  './engine-v2-26-feel.js',
  './engine-v2-26-fixes.js',
  './engine-v2-27-ai.js',
  './engine-v2-27-fixes.js',
  './engine-v2-12.js'
];

for (const source of gameParts) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${source}?v=${VERSION}`;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${source}`));
    document.head.append(script);
  });
}
