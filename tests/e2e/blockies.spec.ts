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


  test('ghost projection lands where hard drop locks and never mutates the live piece', async ({ page }) => {
    await openSolo(page);
    const before = await page.evaluate(() => {
      const win = window as any;
      const player = win.uiManager.getTouchPlayer();
      const piece = player.currentPiece.map((row: number[]) => [...row]);
      const original = { ...player.position };
      const predicted = win.uiManager.projectLanding(player);
      return { piece, original, predicted, id: player.id + 1 };
    });
    expect(before.predicted.y).toBeGreaterThan(before.original.y);
    expect(before.predicted.x).toBe(before.original.x);
    const still = await page.evaluate(() => {
      const win = window as any;
      return { ...win.uiManager.getTouchPlayer().position };
    });
    expect(still.x).toBe(before.original.x);
    await page.keyboard.press('Space');
    const after = await page.evaluate(() => JSON.parse((window as any).render_game_to_text()));
    for (let y = 0; y < before.piece.length; y++) {
      for (let x = 0; x < before.piece[y].length; x++) {
        if (before.piece[y][x]) {
          expect(after.board[before.predicted.y + y][before.predicted.x + x]).toBe(before.id);
        }
      }
    }
  });

  test('pointer capture repeats a held direction and releases cleanly', async ({ page }) => {
    await openSolo(page);
    const first = await page.evaluate(() => {
      const ui = (window as any).uiManager;
      const button = document.querySelector('#touch-controls [data-action="right"]') as HTMLElement;
      const start = ui.getTouchPlayer().position.x;
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 41 }));
      return { start, moved: ui.getTouchPlayer().position.x, pressed: button.getAttribute('aria-pressed') };
    });
    expect(first.moved).toBe(first.start + 1);
    expect(first.pressed).toBe('true');
    await page.waitForTimeout(280);
    const moved = await page.evaluate(() => (window as any).uiManager.getTouchPlayer().position.x);
    expect(moved).toBeGreaterThanOrEqual(first.moved + 1);
    await page.evaluate(() => {
      const button = document.querySelector('#touch-controls [data-action="right"]') as HTMLElement;
      button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 41 }));
    });
    await expect(page.locator('#touch-controls [data-action="right"]')).toHaveAttribute('aria-pressed','false');
    expect(await page.evaluate(() => (window as any).uiManager.getInputState(0,'right').active)).toBe(false);
  });

  test('releasing a keyboard key preserves another held touch pointer on the same action', async ({ page }) => {
    await openSolo(page);
    await page.keyboard.down('ArrowRight');
    await page.evaluate(() => {
      const button = document.querySelector('#touch-controls [data-action="right"]') as HTMLElement;
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 42 }));
    });
    await page.keyboard.up('ArrowRight');
    expect(await page.evaluate(() => (window as any).uiManager.getInputState(0,'right').active)).toBe(true);
    await page.evaluate(() => {
      const button = document.querySelector('#touch-controls [data-action="right"]') as HTMLElement;
      button.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 42 }));
    });
    expect(await page.evaluate(() => (window as any).uiManager.getInputState(0,'right').active)).toBe(false);
  });

  test('pause releases pointer holds before resuming the game', async ({ page }) => {
    await openSolo(page);
    await page.evaluate(() => {
      const button = document.querySelector('#touch-controls [data-action="down"]') as HTMLElement;
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 43 }));
    });
    await page.locator('#pause-btn').click();
    expect(await page.evaluate(() => (window as any).uiManager.getInputState(0,'down').active)).toBe(false);
    await expect(page.locator('#touch-controls [data-action="down"]')).toHaveAttribute('aria-pressed','false');
  });

  test('online removes the impossible local pause action and restores it for solo', async ({ page }) => {
    await openSolo(page);
    await expect(page.locator('#pause-btn')).toBeVisible();
    await page.evaluate(() => {
      const ui = (window as any).uiManager;
      ui.isOnlineMode = true;
      ui.startGame(2, 123);
    });
    await expect(page.locator('#pause-btn')).toBeHidden();
    await page.evaluate(() => {
      const ui = (window as any).uiManager;
      ui.isOnlineMode = false;
      ui.startGame(1, 123);
    });
    await expect(page.locator('#pause-btn')).toBeVisible();
  });

  test('the Hold key swaps once per piece and held/next previews are rendered', async ({ page }) => {
    await openSolo(page);
    const initial = await page.evaluate(() => JSON.parse((window as any).render_game_to_text()));
    const current = initial.players[0].piece;
    const next = initial.players[0].next;
    await page.keyboard.press('KeyC');
    const after = await page.evaluate(() => JSON.parse((window as any).render_game_to_text()));
    expect(after.players[0].held).toEqual(current);
    expect(after.players[0].piece).toEqual(next);
    expect(after.players[0].holdUsed).toBe(true);
    await expect(page.locator('#next-item-0')).toHaveClass(/hold-exhausted/);
    await expect(page.locator('#held-0')).toBeVisible();

    await page.keyboard.press('KeyC');
    const blocked = await page.evaluate(() => JSON.parse((window as any).render_game_to_text()));
    expect(blocked.players[0].piece).toEqual(after.players[0].piece);
    expect(blocked.players[0].next).toEqual(after.players[0].next);
    await page.keyboard.press('Space');
    const locked = await page.evaluate(() => JSON.parse((window as any).render_game_to_text()));
    expect(locked.players[0].holdUsed).toBe(false);
    await page.keyboard.press('KeyC');
    const returned = await page.evaluate(() => JSON.parse((window as any).render_game_to_text()));
    expect(returned.players[0].piece).toEqual(current);
  });

  test('touch Hold button swaps a piece exactly once and updates its preview', async ({ page }) => {
    await openSolo(page);
    const start = await page.evaluate(() => JSON.parse((window as any).render_game_to_text()));
    await page.locator('#touch-controls [data-action="hold"]').dispatchEvent('pointerdown', { pointerId: 71 });
    const after = await page.evaluate(() => JSON.parse((window as any).render_game_to_text()));
    expect(after.players[0].held).toEqual(start.players[0].piece);
    expect(after.players[0].holdUsed).toBe(true);
    await expect(page.locator('#next-item-0')).toHaveClass(/hold-exhausted/);
  });


  test('completed rows produce color-aware fragments at the actual cleared Y and clean up', async ({ page }) => {
    await openSolo(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => {
      const ui = (window as any).uiManager;
      ui.signalLineClear([{ y: 19, owners: Array(10).fill(1) }]);
    });
    await expect(page.locator('#clear-effects .clear-line-stripe')).toHaveCount(1);
    await expect(page.locator('#clear-effects .clear-line-spark')).toHaveCount(10);
    await expect(page.locator('#clear-effects .clear-line-stripe')).toHaveCSS('top', /.+/);
    await expect(page.locator('#clear-effects .clear-line-spark')).toHaveCount(0, { timeout: 2000 });
  });

  test('reconnection UI reports teammate absence without blocking the board', async ({ page }) => {
    await openSolo(page);
    await page.evaluate(() => {
      const win = window as any;
      const ui = win.uiManager;
      ui.isOnlineMode = true;
      ui.localPlayerIndex = 0;
      win.networkManager.connected = true;
      ui.updateOnlinePresence([{ id: 'a', away: true, timedOut: false, departed: false }]);
      ui.showRecoveryNotice('Reconnecting to PocketNet');
    });
    await expect(page.locator('#status-0')).toContainText(/Reconnecting|подключения/);
    await expect(page.locator('#recovery-notice')).toBeVisible();
    await expect(page.locator('#game-canvas')).toBeVisible();
    await page.evaluate(() => {
      const ui = (window as any).uiManager;
      ui.updateOnlinePresence([{ id: 'a', away: false, timedOut: false, departed: false }]);
    });
    await expect(page.locator('#recovery-notice')).toBeHidden();
  });

  test('rejoin during playing never triggers a lobby navigation', async ({ page }) => {
    await openSolo(page);
    const result = await page.evaluate(() => {
      const win = window as any;
      const net = win.networkManager;
      let lobby = 0;
      net.callbacks.roomJoined = () => { lobby++; };
      net.callbacks.roomCreated = () => { lobby++; };
      net.started = true;
      net.inGameUI = true;
      net.connected = true;
      net.code = '1234ABCD';
      const state = win.render_game_to_text();
      net.apply({
        phase: 'playing',
        seed: 123,
        players: [{ id: 'a', color: '#FF1493', ready: false, away: false }],
        engine: { ...JSON.parse(state), sharedStats: { score: 0, lines: 0 }, players: [] }
      }, true);
      return { lobby, active: win.uiManager.screens.gameScreen.classList.contains('active') };
    });
    expect(result.lobby).toBe(0);
    expect(result.active).toBe(true);
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
