(() => {
  'use strict';
  const VERSION = '2.1.0';
  const EXPECTED_LENGTH = 23598;
  const PARTS = Array.from({ length: 10 }, (_, index) => `./plan-v8-source-${index + 1}.part`);
  async function readPart(path) {
    try {
      const response = await fetch(`${path}?v=${VERSION}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    } catch (freshError) {
      console.warn('[РАТЬ] fresh plan fragment unavailable, trying cache', path, freshError);
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Не удалось загрузить ${path}`);
      return response.text();
    }
  }
  globalThis.__RAT_PLAN_V8_PROMISE = Promise.all(PARTS.map(readPart))
    .then((pieces) => {
      const source = pieces.join('');
      if (source.length !== EXPECTED_LENGTH) throw new Error(`Повреждён пакет плана: ${source.length}/${EXPECTED_LENGTH}`);
      (0, eval)(source);
      if (!globalThis.__RAT_PLAN_V8_READY) throw new Error('Предбоевой план не подтвердил готовность');
    })
    .catch((error) => {
      globalThis.__RAT_PLAN_V8_ERROR = error;
      console.error('[РАТЬ] prebattle plan failed', error);
      throw error;
    });
})();
