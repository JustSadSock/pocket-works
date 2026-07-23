import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import * as Engine from './engine.js';

installMobileRuntime();
globalThis.IznankaEngine = Engine;

const parts = ['./app-core.js', './app-modals.js', './app-input.js', './app-combat.js', './app-interactions.js', './app-ai.js', './app-effects.js', './app-render-world.js', './app-render-actors.js', './app-boot.js'];
for (const src of parts) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
    document.head.append(script);
  });
}
