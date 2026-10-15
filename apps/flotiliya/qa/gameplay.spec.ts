import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Флотилия: observational gameplay audit, not a benchmark against invented win rates.
 * Intercept ONLY in Playwright's own browser context to expose simulation controls;
 * shipped app.js and production gameplay are never modified.
 */
test.use({ serviceWorkers: 'block' });

async function openAuditedGame(page: import('@playwright/test').Page) {
  await page.route('**/apps/flotiliya/app.js', async route => {
    const response = await route.fetch();
    const source = await response.text();
    const qaBridge = `
;window.__FLOT_QA__={game,initialFleet,startBattle,startResolve,advance,finishPhase,
  renderHarbor,render,getBudget};
`;
    await route.fulfill({ response, body: source + qaBridge, headers: {
      ...response.headers(), 'cache-control': 'no-store'
    } });
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto('/apps/flotiliya/', { waitUntil: 'domcontentloaded' });
  expect(response?.ok()).toBeTruthy();
  await page.waitForFunction(() => Boolean((window as any).__FLOT_QA__), undefined, { timeout: 12000 });
  return errors;
}

test('real controls, mobile/desktop geometry, opening battle evidence', async ({ page }, info) => {
  const errors = await openAuditedGame(page);
  await expect(page.locator('#sailBtn')).toBeVisible();
  await page.screenshot({ path: info.outputPath('01-harbor.png'), fullPage: true });
  await page.locator('#sailBtn').click();
  await expect(page.locator('#resolveBtn')).toBeVisible();
  await page.screenshot({ path: info.outputPath('02-orders.png'), fullPage: true });

  const state = await page.evaluate(() => {
    const q = (window as any).__FLOT_QA__, game = q.game;
    const s = game.ships.find((ship: any) => ship.side === 'ally');
    const canvas = document.getElementById('sea') as HTMLCanvasElement;
    const r = canvas.getBoundingClientRect(), scale = Math.min(r.width / 660, r.height / 1000);
    return {
      ship: { id: s.id, x: s.x, y: s.y },
      point: { x: r.left + (r.width - 660 * scale) / 2 + s.x * scale,
               y: r.top + (r.height - 1000 * scale) / 2 + s.y * scale },
      geometry: {
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
        canvasWidth: r.width,
        canvasHeight: r.height,
        commandHeight: document.getElementById('command')!.getBoundingClientRect().height,
        executeVisible: document.getElementById('resolveBtn')!.getBoundingClientRect().height > 0
      }
    };
  });
  expect(state.geometry.document).toBeLessThanOrEqual(state.geometry.viewport + 8);
  expect(state.geometry.canvasHeight).toBeGreaterThan(140);
  expect(state.geometry.executeVisible).toBe(true);

  await page.mouse.click(state.point.x, state.point.y);
  const selected = await page.evaluate(() => (window as any).__FLOT_QA__.game.selected);
  expect(selected).toBe(state.ship.id);
  await page.locator('[data-stage="0"]').click();
  await page.locator('[data-order="hold"]').click();
  await page.mouse.move(state.point.x + 22, state.point.y - 12);
  await page.mouse.down();
  await page.mouse.move(state.point.x + 30, state.point.y - 20, { steps: 7 });
  await page.mouse.up();
  const routeLength = await page.evaluate(() => {
    const game = (window as any).__FLOT_QA__.game;
    return game.ships.find((s: any) => s.id === game.selected).orders[0].route.length;
  });
  expect(routeLength).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('03-route-selected.png'), fullPage: true });
  await page.locator('#clearRouteBtn').click();
  const cleared = await page.evaluate(() => {
    const g = (window as any).__FLOT_QA__.game;
    return g.ships.find((s: any) => s.id === g.selected).orders[0].route.length;
  });
  expect(cleared).toBe(0);
  await page.locator('#resolveBtn').click();
  await expect(page.locator('#progress')).toBeVisible();
  await page.screenshot({ path: info.outputPath('04-resolving.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('full-battle policy matrix: default, idle, shooting, focus fire and boarding', async ({ page }, info) => {
  test.setTimeout(120000);
  const errors = await openAuditedGame(page);
  const results = await page.evaluate(() => {
    const api = (window as any).__FLOT_QA__;
    const scenarios = [1, 2, 3, 6];
    const policies = ['default', 'hold', 'shoot', 'focus', 'board'];
    const report: any[] = [];
    const invalid: string[] = [];
    for (const scenario of scenarios) for (const policy of policies) {
      const g = api.game;
      g.fleet = api.initialFleet();
      g.gold = 130;
      g.battleIndex = scenario;
      api.startBattle();
      let roundCount = 0, noRouteMovement = 0, firstDamageRound: number | null = null;
      let overspentEnemyPhases = 0, overspentAllyPhases = 0, executedStages = 0, deaths = 0;
      while (g.phase !== 'result' && roundCount < 24) {
        roundCount++;
        const allies = g.ships.filter((s: any) => s.side === 'ally' && s.alive);
        const foes = g.ships.filter((s: any) => s.side === 'enemy' && s.alive);
        if (policy !== 'default') {
          const focus = foes.slice().sort((a: any, b: any) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
          for (const s of allies) {
            const kind = policy === 'focus' ? 'shoot' : policy;
            s.orders = Array.from({length:2}, () => ({
              kind, route: [], targetId: policy === 'focus' ? (focus?.id || null) : null
            }));
          }
        }
        overspentEnemyPhases += g.ships.filter((s: any) => s.side === 'enemy' && s.alive && !api.getBudget(s).valid).length;
        overspentAllyPhases += allies.filter((s: any) => !api.getBudget(s).valid).length;
        const starting = allies.map((s: any) => ({ ship:s, x:s.x, y:s.y,
          noRoute:s.orders.every((o: any) => !o.route?.length) }));
        api.startResolve();
        for (let i = 0; i < 90; i++) api.advance(0.05);
        executedStages += 2;
        for (const b of starting) {
          if (b.noRoute) noRouteMovement += Math.hypot(b.ship.x - b.x, b.ship.y - b.y);
        }
        if (firstDamageRound === null && g.ships.some((s: any) => s.hp < s.maxHp - 0.01 || s.crew < s.maxCrew - 0.01)) {
          firstDamageRound = roundCount;
        }
        for (const s of g.ships) {
          if (![s.x,s.y,s.angle,s.hp,s.crew,s.oars,s.morale].every(Number.isFinite))
            invalid.push(`${scenario}/${policy}/turn${roundCount}: non-finite ship state ${s.id}`);
        }
        api.finishPhase();
      }
      if (g.phase !== 'result') invalid.push(`${scenario}/${policy}: unfinished after ${roundCount} rounds`);
      deaths = g.ships.filter((s: any) => s.side === 'ally' && !s.alive && !s.escaped).length;
      report.push({
        map: scenario, weather: g.weather?.name, policy, rounds: roundCount,
        win: Boolean(g.endVictory),
        friendlySurvivors: g.ships.filter((s: any) => s.side === 'ally' && s.alive).length,
        enemySurvivors: g.ships.filter((s: any) => s.side === 'enemy' && s.alive).length,
        friendlyCasualties: deaths,
        captured: g.captured.length,
        friendlyRemainingHull: Math.round(g.ships.filter((s: any) => s.side === 'ally' && s.alive)
          .reduce((n: number, s: any) => n + 100 * s.hp / s.maxHp, 0)),
        dealt: Math.round(g.ships.filter((s: any) => s.side === 'ally').reduce((n: number, s: any) => n + s.dealt,0)),
        reward: g.gold - 130, firstDamageRound,
        noRouteMovement: Math.round(noRouteMovement),
        overspentEnemyPhases, overspentAllyPhases, executedStages
      });
    }
    return { report, invalid };
  });
  const folder = process.env.PW_QA_OUTPUT_DIR || info.outputDir;
  mkdirSync(folder, {recursive:true});
  writeFileSync(join(folder, `flotiliya-matrix-${info.project.name}.json`), JSON.stringify(results,null,2));
  console.log('FLOTILIYA_AUDIT_MATRIX ' + JSON.stringify(results));
  expect(results.report).toHaveLength(20);
  expect(results.invalid).toEqual([]);
  expect(errors).toEqual([]);
  // Audit-only: No arbitrary win-rate threshold is treated as a correctness gate.
  // Compare outcomes to diagnose the value of orders, pacing and engagement.
});
