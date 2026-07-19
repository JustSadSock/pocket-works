(() => {
  'use strict';

  const VERSION = '2.0.0';
  const EXPECTED_LENGTH = 33691;
  const PARTS = Array.from({ length: 13 }, (_, index) => `./campaign-v7-source-${index + 1}.part`);

  async function readPart(path) {
    try {
      const response = await fetch(`${path}?v=${VERSION}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    } catch (freshError) {
      console.warn('[РАТЬ] fresh tactical fragment unavailable, trying cache', path, freshError);
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Не удалось загрузить ${path}`);
      return response.text();
    }
  }

  globalThis.__RAT_CAMPAIGN_V7_PROMISE = Promise.all(PARTS.map(readPart))
    .then((pieces) => {
      const source = pieces.join('');
      if (source.length !== EXPECTED_LENGTH) {
        throw new Error(`Повреждён пакет тактики: ${source.length}/${EXPECTED_LENGTH}`);
      }
      (0, eval)(source);
      if (!globalThis.__RAT_CAMPAIGN_V7_READY) {
        throw new Error('Тактический режим не подтвердил готовность');
      }
    })
    .catch((error) => {
      globalThis.__RAT_CAMPAIGN_V7_ERROR = error;
      console.error('[РАТЬ] tactical campaign failed', error);
      throw error;
    });
})();
