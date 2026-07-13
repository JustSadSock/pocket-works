import { expect, test } from '@playwright/test';

test.describe('SENTE GNU Go browser core', () => {
  test('loads one coherent 2.1 build and returns legal moves without emergency fallback', async ({ page }) => {
    test.setTimeout(90_000);
    const suspiciousConsole: string[] = [];
    const requestedUrls: string[] = [];

    page.on('request', (request) => {
      if (request.url().includes('/apps/sente/')) requestedUrls.push(request.url());
    });
    page.on('console', (message) => {
      const text = message.text();
      if (/SENTE GNU Go fallback|out of memory|requested exit|worker crashed/i.test(text)) suspiciousConsole.push(text);
    });
    page.on('pageerror', (error) => suspiciousConsole.push(error.message));

    await page.goto('/apps/sente/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toHaveAttribute('data-sente-build', '2.1.0');

    const result = await page.evaluate(async () => {
      const rules = await import('/apps/sente/go-engine.js?v=2.1.0');
      const client = await import('/apps/sente/gnugo-client-v2.1.js?v=2.1.0');
      const ai = await import('/apps/sente/ai-v2.1.js?v=2.1.0');
      const output = [];

      for (const level of ['calm', 'steady'] as const) {
        const game = rules.createGame({ size: 9, komi: 6.5 });
        const move = await client.chooseGnugoMove(game, level);
        output.push({
          level,
          x: move?.x,
          y: move?.y,
          pass: Boolean(move?.pass),
          engine: move?.engine,
          reason: move?.reason,
          legal: move?.pass ? true : Boolean(move && rules.inspectMove(game, move.x, move.y, game.turn).legal),
          reads: move?.reads || 0
        });
      }

      client.resetGnugoWorker();
      return {
        build: window.__SENTE_BUILD__,
        masterLabel: ai.aiLabel('sharp'),
        moves: output
      };
    });

    expect(result.build).toBe('2.1.0');
    expect(result.masterLabel).toBe('Мастер · GNU Go');
    expect(result.moves).toHaveLength(2);
    for (const move of result.moves) {
      expect(move.engine).toMatch(/^3\./);
      expect(move.reason).toBe('gnugo');
      expect(move.pass).toBe(false);
      expect(move.legal).toBe(true);
      expect(move.x).toBeGreaterThanOrEqual(0);
      expect(move.y).toBeGreaterThanOrEqual(0);
      expect(move.x).toBeLessThan(9);
      expect(move.y).toBeLessThan(9);
      expect(move.reads).toBeGreaterThan(0);
    }

    const urls = requestedUrls.map((value) => new URL(value));
    expect(urls.some((url) => url.pathname.endsWith('/apps/sente/app.js') && url.searchParams.get('v') === '2.1.0')).toBe(true);
    expect(urls.some((url) => url.pathname.endsWith('/apps/sente/runtime-1.txt') && url.searchParams.get('v') === '2.1.0')).toBe(true);
    expect(urls.some((url) => url.pathname.endsWith('/apps/sente/ai-v2.1.js') && url.searchParams.get('v') === '2.1.0')).toBe(true);
    expect(urls.some((url) => url.pathname.endsWith('/apps/sente/gnugo-worker-v2.1.js') && url.searchParams.get('v') === '2.1.0')).toBe(true);
    expect(urls.some((url) => url.pathname.endsWith('/apps/sente/assets/gnugo/gnugo.wasm') && url.searchParams.get('v') === '2.1.0')).toBe(true);
    expect(urls.some((url) => url.pathname.endsWith('/apps/sente/ai.js') && !url.searchParams.has('v'))).toBe(false);
    expect(urls.some((url) => /\/apps\/sente\/runtime-[1-4]\.txt$/.test(url.pathname) && url.searchParams.get('v') !== '2.1.0')).toBe(false);
    expect(suspiciousConsole).toEqual([]);
  });

  test('drops only the unfinished legacy AI game on the first 2.1 load', async ({ page }) => {
    await page.goto('/apps/sente/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.setItem('pocket-works:sente:engine-build', '2.0.0');
      localStorage.setItem('pocket-works:sente:state:v1', JSON.stringify({
        settings: { size: 19, mode: 'ai', level: 'sharp', sound: false },
        current: { size: 19, phase: 'playing', moves: [{ x: 3, y: 3, color: 1 }] },
        archive: [{ identity: 'kept-game', endedAt: 1, game: { size: 9 } }]
      }));
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    const migrated = await page.evaluate(() => ({
      build: localStorage.getItem('pocket-works:sente:engine-build'),
      state: JSON.parse(localStorage.getItem('pocket-works:sente:state:v1') || 'null')
    }));

    expect(migrated.build).toBe('2.1.0');
    expect(migrated.state.current).toBeNull();
    expect(migrated.state.settings).toMatchObject({ size: 19, mode: 'ai', level: 'sharp', sound: false });
    expect(migrated.state.archive).toHaveLength(1);
    expect(migrated.state.archive[0].identity).toBe('kept-game');
    await expect(page.locator('#toast')).toContainText('Старая AI-партия закрыта');
  });
});
