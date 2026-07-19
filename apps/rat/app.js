import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';

installMobileRuntime();
globalThis.__RAT_DEPS__ = { createWorkshopMode };

const parts = [
  './game-part-1.js',
  './game-part-2.js',
  './game-part-3.js',
  './game-part-4.js',
  './game-part-5.js',
  './game-part-6.js',
  './game-part-7.js',
  './combat-v2-1.js',
  './combat-v2-2.js',
  './combat-v2-3.js',
  './combat-v2-4.js',
  './combat-v2-5.js',
  './combat-v2-6.js',
  './combat-v2-run.js',
  './command-system-v2.js',
  './command-system-v2-fix.js',
  './game-part-8.js'
];

try {
  for (const src of parts) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
      document.head.append(script);
    });
  }
  if (!globalThis.__RAT_COMBAT_V2_READY) {
    throw globalThis.__RAT_COMBAT_V2_ERROR || new Error('Новая модель боя не загрузилась');
  }
  if (!globalThis.__RAT_COMMAND_TEST__) {
    throw new Error('Система тактов командования не загрузилась');
  }
} catch (error) {
  console.error('[РАТЬ] startup failed', error);
  document.querySelector('[data-app-shell]').innerHTML = `
    <section style="min-height:100dvh;display:grid;place-content:center;gap:16px;padding:24px;background:#26352e;color:#f4ead0;text-align:center">
      <strong style="font:700 34px Georgia,serif">РАТЬ НЕ СОБРАЛАСЬ</strong>
      <span>Файлы сражения загрузились не полностью. Обновите приложение.</span>
      <a href="../../" data-app-control style="color:#e4c987;font-weight:800">ВЫЙТИ В POCKET WORKS</a>
    </section>`;
} finally {
  delete globalThis.__RAT_DEPS__;
  delete globalThis.__RAT_COMBAT_V2_ERROR;
}
