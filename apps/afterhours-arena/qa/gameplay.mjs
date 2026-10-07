import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const url = process.env.ARENA_URL || 'http://127.0.0.1:4173/apps/afterhours-arena/';
const output = process.env.ARENA_QA_OUTPUT || path.resolve('work/arena-qa');
await fs.mkdir(output, { recursive: true });
const summaries = [];
for (const [engine, dimensions] of [[chromium, [1280, 900]], [chromium, [844, 390]], [chromium, [390, 844]], [webkit, [844, 390]], [webkit, [390, 844]]]) {
  const browser = await engine.launch({ headless: true });
  const name = `${engine.name()}-${dimensions.join('x')}`;
  const context = await browser.newContext({ viewport: { width: dimensions[0], height: dimensions[1] }, deviceScaleFactor: dimensions[0] < 900 ? 2 : 1, hasTouch: dimensions[0] < 900, isMobile: dimensions[0] < 900 });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const snapshot = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const advance = ms => page.evaluate(ms => window.advanceTime(ms), ms);
  const shot = label => page.screenshot({ path: path.join(output, `${name}-${label}.png`), fullPage: true });
  try {
    await page.goto(url); await page.waitForSelector('#menu:not([hidden])');
    await shot('menu');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no horizontal overflow');
    await page.locator('#help-btn').click(); assert.equal(await page.locator('#help-dialog').evaluate(d => d.open), true); await shot('help'); await page.locator('#help-done').click();
    await page.locator('[data-fighter="vesper"]').click(); assert.equal((await snapshot()).selected, 'vesper');
    await page.locator('#sound-btn').click(); assert.equal((await snapshot()).sound, false);
    await page.reload(); await page.waitForSelector('#menu:not([hidden])');
    assert.equal((await snapshot()).selected, 'vesper'); assert.equal((await snapshot()).sound, false);
    await page.locator('#start-btn').click(); await advance(1800); assert.equal((await snapshot()).mode, 'fight');
    const x = (await snapshot()).fighters[0].x;
    const leftButton = page.locator('[data-input="left"]');
    const leftBox = await leftButton.boundingBox(); await page.mouse.move(leftBox.x + leftBox.width / 2, leftBox.y + leftBox.height / 2); await page.mouse.down(); await advance(250); await page.mouse.up();
    assert.ok((await snapshot()).fighters[0].x < x, 'touch movement');
    await page.keyboard.down('Space'); await advance(180); await page.keyboard.up('Space'); assert.ok((await snapshot()).fighters[0].height > 15, 'jump'); await shot('jump'); await advance(800);
    await page.keyboard.down('s'); await advance(40); assert.equal((await snapshot()).fighters[0].blocking, true, 'held block'); await page.keyboard.up('s'); await advance(120);
    const meter = (await snapshot()).fighters[0].energy;
    await page.keyboard.down('l'); await advance(350); await page.keyboard.up('l');
    assert.ok((await snapshot()).fighters[0].energy < meter, 'special spends meter'); await shot('special'); await advance(600);
    await page.locator('#pause-btn').click(); const time = (await snapshot()).seconds; await advance(3000); assert.equal((await snapshot()).mode, 'paused'); assert.equal((await snapshot()).seconds, time); await shot('paused');
    await page.locator('#continue-btn').click(); assert.equal((await snapshot()).mode, 'fight');
    await page.keyboard.down('d'); await advance(700); await page.keyboard.up('d');
    await page.keyboard.down('j'); await advance(500); await page.keyboard.up('j'); await page.keyboard.down('k'); await advance(450); await page.keyboard.up('k'); await shot('fight');
    const fightState = await snapshot(); assert.ok(fightState.fighters[1].health < 100, 'player attacks damage the CPU');
    // Finish through real CPU gameplay, then exercise every between-round/result action.
    for (let i = 0; i < 5 && (await snapshot()).mode !== 'result'; i++) {
      await advance(70000);
      if ((await snapshot()).mode === 'round') { await shot('round'); await page.locator('#continue-btn').click(); await advance(1800); }
    }
    assert.equal((await snapshot()).mode, 'result', 'CPU completes a best-of-three match'); await shot('result');
    assert.equal((await snapshot()).record.played, 1);
    await page.locator('#continue-btn').click(); assert.equal((await snapshot()).mode, 'intro', 'rematch');
    await page.locator('#pause-btn').click(); await page.locator('#select-btn').click(); assert.equal((await snapshot()).mode, 'menu');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload(); await page.waitForSelector('#menu:not([hidden])');
    assert.equal(await page.evaluate(() => !!navigator.serviceWorker.controller), true, 'service worker controls the page');
    let cachedResponses = 0; page.on('response', response => { if (response.fromServiceWorker()) cachedResponses++; });
    const offline = engine === webkit ? 'cache verified; Windows WebKit offline navigation unsupported' : 'offline reload verified';
    if (engine === webkit) {
      assert.deepEqual(await page.evaluate(async () => Promise.all(['index.html', 'app.js', 'styles.css'].map(async file => !!(await caches.match(new URL(file, location.href).href, { ignoreSearch: true }))))), [true, true, true], 'WebKit caches the complete game');
    } else {
      await context.setOffline(true); await page.reload(); await page.waitForSelector('#menu:not([hidden])');
      assert.ok(cachedResponses >= 3, 'offline HTML, JS and CSS come from the service worker');
      assert.equal((await snapshot()).record.played, 1); await shot('offline'); await context.setOffline(false);
    }
    assert.deepEqual(errors, [], 'no browser errors');
    summaries.push({ name, pass: true, fightState, offline, errors });
    console.log(`${name}: gameplay/result/persistence PASS; ${offline}`);
  } catch (e) { await shot('failure'); summaries.push({ name, pass: false, message: e.message, errors }); console.error(`${name}: ${e.stack}`); }
  finally { await browser.close(); }
}
await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(summaries, null, 2));
if (summaries.some(s => !s.pass)) process.exitCode = 1;
