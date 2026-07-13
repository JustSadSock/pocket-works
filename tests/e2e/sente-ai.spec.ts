import { expect, test } from '@playwright/test';

test.describe('SENTE GNU Go browser core', () => {
  test('loads the real worker and returns legal moves without emergency fallback', async ({ page }) => {
    test.setTimeout(90_000);
    const suspiciousConsole: string[] = [];
    page.on('console', (message) => {
      const text = message.text();
      if (/SENTE GNU Go fallback|out of memory|requested exit|worker crashed/i.test(text)) suspiciousConsole.push(text);
    });
    page.on('pageerror', (error) => suspiciousConsole.push(error.message));

    await page.goto('/apps/sente/', { waitUntil: 'domcontentloaded' });

    const results = await page.evaluate(async () => {
      const rules = await import('/apps/sente/go-engine.js');
      const client = await import('/apps/sente/gnugo-client.js');
      const levels = ['calm', 'steady'] as const;
      const output = [];

      for (const level of levels) {
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
      return output;
    });

    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result.engine).toMatch(/^3\./);
      expect(result.reason).toBe('gnugo');
      expect(result.pass).toBe(false);
      expect(result.legal).toBe(true);
      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.y).toBeGreaterThanOrEqual(0);
      expect(result.x).toBeLessThan(9);
      expect(result.y).toBeLessThan(9);
      expect(result.reads).toBeGreaterThan(0);
    }
    expect(suspiciousConsole).toEqual([]);
  });
});
