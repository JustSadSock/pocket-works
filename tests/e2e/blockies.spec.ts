import { expect, test } from '@playwright/test';

async function openSolo(page: import('@playwright/test').Page) {
  await page.goto('/apps/blockies/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean((window as any).uiManager));
  await page.locator('#mode-single').click();
  await expect(page.locator('#game-canvas')).toBeVisible();
}

test.describe('Blockies — solo/input/lifecycle smoke', () => {
  test('keyboard, pause, restart, and return to menu', async ({ page }) => {
    await openSolo(page);
    const initial = await page.evaluate(() => JSON.parse((window as any).render_game_to_text()));
    expect(initial.players).toHaveLength(1);
    expect(initial.board).toHaveLength(20);
    expect(initial.score.score).toBe(0);

    await page.keyboard.press('ArrowRight');
    const moved = await page.evaluate(() => JSON.parse((window as any).render_game_to_text()));
    expect(moved.players[0].position.x).toBe(initial.players[0].position.x + 1);

    await page.locator('#pause-btn').click();
    await expect(page.locator('#pause-menu')).toHaveClass(/active/);
    await page.locator('#restart-btn').click();
    await expect(page.locator('#pause-menu')).not.toHaveClass(/active/);
    const restarted = await page.evaluate(() => JSON.parse((window as any).render_game_to_text()));
    expect(restarted.score.score).toBe(0);
    expect(restarted.players).toHaveLength(1);

    await page.locator('#quit-btn').click();
    await expect(page.locator('#main-menu')).toHaveClass(/active/);
    expect(await page.evaluate(() => (window as any).uiManager.gameFrame)).toBeNull();
  });

  test('going to background opens a visible pause and releases held inputs', async ({ page }) => {
    await openSolo(page);
    await page.keyboard.down('ArrowLeft');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.locator('#pause-menu')).toHaveClass(/active/);
    const state = await page.evaluate(() => JSON.parse((window as any).render_game_to_text()));
    expect(state.paused).toBe(true);
    await page.keyboard.up('ArrowLeft');
  });

  test('room and player nicknames render as text rather than HTML', async ({ page }) => {
    await page.goto('/apps/blockies/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean((window as any).uiManager));
    await page.evaluate(() => {
      const ui = (window as any).uiManager;
      const payload = '<img src=x onerror="window.__xss = true">';
      ui.showRoomsList([{ id: 'TEST1234', name: payload, players: 1, maxPlayers: 4 }]);
      ui.updateRoomView({
        name: 'Room', players: [{ id: 'foreign', name: payload, color: '#FF1493', ready: false }],
      });
    });
    expect(await page.locator('#rooms-list img, #room-players-list img').count()).toBe(0);
    await expect(page.locator('#rooms-list h4')).toContainText('<img src=x');
    await expect(page.locator('#room-players-list .room-player-name')).toContainText('<img src=x');
    expect(await page.evaluate(() => Boolean((window as any).__xss))).toBe(false);
  });

  test('online results display authoritative team votes and rematch does not reset locally', async ({ page }) => {
    await openSolo(page);
    await page.evaluate(() => {
      const win = window as any;
      win.uiManager.isOnlineMode = true;
      win.networkManager.socket.id = 'a';
      win.networkManager.connected = true;
      win.networkManager.phase = 'results';
      win.__votes = 0;
      win.networkManager.requestRematch = () => { win.__votes++; };
      win.uiManager.updateRematchStatus({
        phase: 'results',
        players: [
          { id: 'a', ready: false, departed: false },
          { id: 'b', ready: true, departed: false }
        ]
      });
    });
    await expect(page.locator('#gameover-menu')).toHaveClass(/active/);
    await expect(page.locator('#rematch-status')).toContainText('1 of 2');
    await expect(page.locator('#play-again-btn')).toContainText('Play again');
    const before = await page.evaluate(() => JSON.parse((window as any).render_game_to_text()));
    await page.locator('#play-again-btn').click();
    const after = await page.evaluate(() => JSON.parse((window as any).render_game_to_text()));
    expect(after.board).toEqual(before.board);
    expect(await page.evaluate(() => (window as any).__votes)).toBe(1);
    await page.evaluate(() => (window as any).uiManager.updateRematchStatus({
      phase: 'results',
      players: [
        { id: 'a', ready: true, departed: false },
        { id: 'b', ready: true, departed: false }
      ]
    }));
    await expect(page.locator('#play-again-btn')).toContainText('Cancel ready');
  });

  test('online-touch ownership and mobile board bounds', async ({ page }) => {
    await page.goto('/apps/blockies/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean((window as any).uiManager));
    const target = await page.evaluate(() => {
      const ui = (window as any).uiManager;
      ui.startGame(2, 123456);
      ui.isOnlineMode = true;
      ui.localPlayerIndex = 1;
      return ui.getTouchPlayer()?.id;
    });
    expect(target).toBe(1);
    const bounds = await page.locator('#game-canvas').boundingBox();
    const viewport = page.viewportSize();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThan(25);
    expect(bounds!.x).toBeGreaterThanOrEqual(-1);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width + 2);
  });
});
