import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Product-level screenshots: unlike the ordinary menu smoke test, these
// capture every authored hole in the real running WebGL/Canvas application.
test('all nine greenhouse courses keep their world, HUD and scenery coherent', async ({ page }, testInfo) => {
  test.setTimeout(115000);
  const folder=join(process.env.PW_QA_OUTPUT_DIR || testInfo.outputDir,'nine-garden-captures',testInfo.project.name);
  mkdirSync(folder,{recursive:true});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const response=await page.goto('/apps/moss-marble/',{waitUntil:'domcontentloaded'});
  expect(response?.ok()).toBeTruthy();
  await page.waitForFunction(()=>Boolean(window.__MOSS_MARBLE__?.startHole),null,{timeout:15000});
  const game=page.locator('#game');
  await expect(game).toBeVisible();
  for(let index=0;index<9;index++){
    const info=await page.evaluate(index=>{
      window.__MOSS_MARBLE__.startHole(index);
      window.__MOSS_MARBLE__.toggleOverview();
      return window.__MOSS_MARBLE__.snapshot();
    },index);
    expect(info.mode).toBe('playing');
    expect(info.levelIndex).toBe(index);
    expect(info.level.id).toBe(index+1);
    expect(info.strokes).toBe(0);
    await expect(page.locator('#holeNumber')).toContainText(String(index+1));
    await expect(page.locator('#courseName')).toHaveText(info.level.name);
    await page.waitForTimeout(570);
    const status=await page.evaluate(()=>{
      const meter=document.querySelector('#routeMeter');
      const hud=document.querySelector('.scorebar')?.getBoundingClientRect();
      const controls=document.querySelector('#overviewBtn')?.getBoundingClientRect();
      const rect=document.querySelector('#game')?.getBoundingClientRect();
      return {
        value:Number(meter?.getAttribute('aria-valuenow')||0),
        chromeVisible:hud?.height>0&&controls?.height>0,
        gameSize:[rect?.width||0,rect?.height||0],
        overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth
      };
    });
    expect(status.chromeVisible).toBe(true);
    expect(status.overflow).toBeLessThanOrEqual(8);
    expect(status.gameSize[0]).toBeGreaterThan(250);
    expect(status.gameSize[1]).toBeGreaterThan(300);
    expect(status.value).toBeGreaterThanOrEqual(0);
    expect(status.value).toBeLessThanOrEqual(100);
    await page.screenshot({
      path:join(folder,`garden-${String(index+1).padStart(2,'0')}-overview.png`),
      animations:'disabled'
    });
    // Representative close-follow frames at the beginning, storm bridge and
    // final night garden expose HUD/aim control occlusion issues.
    if([0,4,8].includes(index)){
      await page.evaluate(()=>window.__MOSS_MARBLE__.toggleOverview());
      await page.waitForTimeout(690);
      await page.screenshot({
        path:join(folder,`garden-${String(index+1).padStart(2,'0')}-follow.png`),
        animations:'disabled'
      });
    }
  }
  expect(errors,errors.join('\n')).toEqual([]);
});
