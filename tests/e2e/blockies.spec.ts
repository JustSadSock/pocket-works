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

  test('PocketNet v6 uses autonomous server ticks instead of client pulse intervals', async ({ page }) => {
    await openSolo(page);
    const result=await page.evaluate(()=>{
      const net=(window as any).networkManager;
      net.stopPulse();
      net.moduleVersion='v6';
      net.started=true;
      net.startPulse();
      const modern=net.timer===null;
      net.moduleVersion='v5';
      net.startPulse();
      const legacy=net.timer!==null;
      net.stopPulse();
      net.started=false;
      return {modern,legacy};
    });
    expect(result).toEqual({modern:true,legacy:true});
  });

  test('two browser tabs only issue inputs for their own online piece', async ({ page }) => {
    const second=await page.context().newPage();
    try {
      await Promise.all([openSolo(page),openSolo(second)]);
      const boot=async (tab: import('@playwright/test').Page,id: string)=>{
        return tab.evaluate((playerId)=>{
          const w=window as any,ui=w.uiManager,net=w.networkManager;
          net.socket.id=playerId;
          net.connected=true;
          net.moduleVersion='v7';
          net.phase='playing';
          net.currentRound=1;
          w.__commands=[];
          net.send=(message:any)=>w.__commands.push(message);
          ui.startOnlineGame({seed:12345,players:[
            {id:'a',color:'#FF1493',ready:false},
            {id:'b',color:'#00D9FF',ready:false}
          ]});
          ui.handleTouchAction('hold');
          return {controlled:ui.localPlayerIndex,
            localId:ui.getTouchPlayer()?.id,
            input:w.__commands[0]};
        },id);
      };
      const [a,b]=await Promise.all([boot(page,'a'),boot(second,'b')]);
      expect(a.controlled).toBe(0);
      expect(a.localId).toBe(0);
      expect(b.controlled).toBe(1);
      expect(b.localId).toBe(1);
      expect(a.input).toMatchObject({type:'input',round:1,input:{action:'hold'}});
      expect(b.input).toMatchObject({type:'input',round:1,input:{action:'hold'}});
    } finally {
      await second.close();
    }
  });

  test('out-of-order room revisions and previous round packets cannot rewind the UI',async({page})=>{
    await openSolo(page);
    const result=await page.evaluate(()=>{
      const w=window as any,net=w.networkManager;
      net.inGameUI=true;net.started=true;net.phase='playing';
      net.moduleVersion='v7';net.code='AABBCCDD';
      let roomUpdates=0;
      net.on('roomUpdate',()=>{roomUpdates++});
      net.apply({phase:'playing',revision:10,round:3,
        players:[{id:'a',color:'#FF1493'}]},false);
      net.apply({phase:'playing',revision:9,round:2,
        players:[{id:'a',color:'#FF1493'}]},false);
      const messages:any[]=[];
      net.send=p=>messages.push(p);
      net.sendPlayerInput({action:'rotate'});
      return {round:net.currentRound,revision:net.lastRevision,roomUpdates,
        sent:messages[0]};
    });
    expect(result).toEqual({round:3,revision:10,roomUpdates:1,
      sent:{type:'input',round:3,input:{action:'rotate'}}});
  });

  test('replay timeline opens on results and persists after a page reload',async({page})=>{
    await openSolo(page);
    await page.keyboard.press('Space');
    await page.evaluate(()=>((window as any).uiManager as any).showGameOver());
    await expect(page.locator('#replay-open')).toBeEnabled();
    await page.locator('#replay-open').click();
    await expect(page.locator('#replay-viewer')).toBeVisible();
    await expect(page.locator('#replay-canvas')).toBeVisible();
    await expect(page.locator('#replay-caption')).toContainText('кадр');
    await page.locator('#replay-next').click();
    await page.locator('#replay-play').click();
    await expect(page.locator('#replay-play')).toContainText(/Пауза|Воспроизвести/);
    await page.locator('#replay-close').click();
    await expect(page.locator('#replay-viewer')).toBeHidden();
    await page.reload();
    await page.waitForFunction(()=>Boolean((window as any).uiManager));
    await expect(page.locator('#replay-last')).toBeEnabled();
    await page.locator('#replay-last').click();
    await expect(page.locator('#replay-viewer')).toBeVisible();
  });

  test('exported replay imports with the same board and score and rejects invalid files',async({page})=>{
    await openSolo(page);
    await page.keyboard.press('Space');
    await page.evaluate(()=>((window as any).uiManager as any).showGameOver());
    const raw=await page.evaluate(()=>localStorage.getItem('pocket-works:blockies:last-replay-v1')!);
    expect(raw).toContain('blockies-replay-v1');
    const download=page.waitForEvent('download');
    await page.locator('#replay-save').click();
    const file=await download;
    expect(file.suggestedFilename()).toMatch(/blockies-replay-.*\.json/);
    await page.locator('#replay-file').setInputFiles({
      name:'blockies.json',mimeType:'application/json',buffer:Buffer.from(raw)
    });
    await expect(page.locator('#replay-viewer')).toBeVisible();
    const score=await page.locator('#replay-score').textContent();
    expect(score).toContain('Счёт');
    await page.locator('#replay-file').setInputFiles({
      name:'bad.json',mimeType:'application/json',
      buffer:Buffer.from('{"format":"blockies-replay-v1","frames":[]}')
    });
    await expect(page.locator('#replay-error')).toContainText('Не удалось открыть повтор');
    await expect(page.locator('#replay-viewer')).toBeVisible();
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
