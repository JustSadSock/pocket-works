import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';

installMobileRuntime();
globalThis.__RAT_DEPS__ = { createWorkshopMode };

const BUILD_VERSION = '2.1.0';
const criticalParts = [
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
  './battle-ui-v3.js',
  './battle-ui-v3-fix.js',
  './game-part-8.js',
  './shell-ui-v4.js',
  './shell-ui-v4-fix.js',
  './screen-redesign-v5.js',
  './screen-redesign-v5-fix.js'
];

const enhancements = [
  { src: './setup-redesign-v6.js', ready: '__RAT_SETUP_V6_READY', error: '__RAT_SETUP_V6_ERROR', label: 'экран построения' },
  { src: './setup-redesign-v6-recovery.js', ready: '__RAT_SETUP_RECOVERY_READY', label: 'восстановление экрана построения' },
  { src: './campaign-v7.js', promise: '__RAT_CAMPAIGN_V7_PROMISE', ready: '__RAT_CAMPAIGN_V7_READY', error: '__RAT_CAMPAIGN_V7_ERROR', label: 'тактическое разнообразие' },
  { src: './plan-v8.js', promise: '__RAT_PLAN_V8_PROMISE', ready: '__RAT_PLAN_V8_READY', error: '__RAT_PLAN_V8_ERROR', label: 'предбоевой план' }
];

function appendScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
    document.head.append(script);
  });
}

async function loadFreshWithFallback(src) {
  try {
    await appendScript(`${src}?v=${BUILD_VERSION}`);
  } catch (freshError) {
    console.warn('[РАТЬ] fresh asset unavailable, trying cached copy', src, freshError);
    await appendScript(src);
  }
}

function assertCoreReady() {
  if (!globalThis.__RAT_COMBAT_V2_READY) {
    throw globalThis.__RAT_COMBAT_V2_ERROR || new Error('Новая модель боя не загрузилась');
  }
  if (!globalThis.__RAT_COMMAND_TEST__) {
    throw new Error('Система тактов командования не загрузилась');
  }
  if (!globalThis.__RAT_UI_V3_READY || !globalThis.__RAT_UI_V3_FIXED) {
    throw new Error('Новый боевой интерфейс не загрузился полностью');
  }
  if (!globalThis.__RAT_SHELL_UI_V4_READY || !globalThis.__RAT_SHELL_UI_V4_FIXED) {
    throw new Error('Интерфейс меню не загрузился полностью');
  }
  if (!globalThis.__RAT_SCREEN_V5_READY || !globalThis.__RAT_SCREEN_V5_FIXED) {
    throw new Error('Новая композиция экранов не загрузилась полностью');
  }
}

function showStartupFailure(error) {
  console.error('[РАТЬ] startup failed', error);
  const shell = document.querySelector('[data-app-shell]');
  if (!shell) return;
  shell.innerHTML = `
    <section style="min-height:100dvh;display:grid;place-content:center;gap:14px;padding:24px;background:#26352e;color:#f4ead0;text-align:center">
      <strong style="font:700 34px Georgia,serif">РАТЬ НЕ СОБРАЛАСЬ</strong>
      <span style="max-width:360px;line-height:1.45">Не удалось запустить ядро игры. Сохранённая армия не удалена.</span>
      <button id="ratCacheRepair" type="button" style="min-height:48px;padding:12px 18px;border:1px solid #e4c987;background:#c66a3f;color:#fff4dc;font-weight:900">ОЧИСТИТЬ КЭШ И ПОВТОРИТЬ</button>
      <a href="../../" data-app-control style="color:#e4c987;font-weight:800">ВЫЙТИ В POCKET WORKS</a>
      <small style="opacity:.48">${String(error?.message || error || 'неизвестная ошибка')}</small>
    </section>`;
  document.querySelector('#ratCacheRepair')?.addEventListener('click', async () => {
    try {
      const registrations = await navigator.serviceWorker?.getRegistrations?.() || [];
      await Promise.all(registrations.filter((registration) => registration.scope.includes('/apps/rat/')).map((registration) => registration.unregister()));
      const names = await caches?.keys?.() || [];
      await Promise.all(names.filter((name) => name.startsWith('rat-')).map((name) => caches.delete(name)));
    } finally {
      location.reload();
    }
  });
}

try {
  for (const src of criticalParts) await loadFreshWithFallback(src);
  assertCoreReady();

  for (const enhancement of enhancements) {
    try {
      await loadFreshWithFallback(enhancement.src);
      if (enhancement.promise && globalThis[enhancement.promise]) {
        await globalThis[enhancement.promise];
      }
      if (!globalThis[enhancement.ready]) {
        throw globalThis[enhancement.error] || new Error(`${enhancement.label} не подтвердил готовность`);
      }
    } catch (error) {
      console.error(`[РАТЬ] optional ${enhancement.label} disabled; using previous interface`, error);
      document.documentElement.dataset.ratEnhancementFallback = 'true';
    }
  }
} catch (error) {
  showStartupFailure(error);
} finally {
  delete globalThis.__RAT_DEPS__;
  delete globalThis.__RAT_COMBAT_V2_ERROR;
}
