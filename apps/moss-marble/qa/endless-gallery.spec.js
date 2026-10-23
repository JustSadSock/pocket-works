import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Screenshot the actual first endless section, NOT authored campaign holes.
test('endless sections are visually complete on desktop and phones',async({page},testInfo)=>{
  test.setTimeout(100000);
  const folder=join(process.env.PW_QA_OUTPUT_DIR||testInfo.outputDir,'endless-captures',testInfo.project.name);
  mkdirSync(folder,{recursive:true});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const response=await page.goto('/apps/moss-marble/',{waitUntil:'domcontentloaded'});
  expect(response?.ok()).toBeTruthy();
  await page.waitForFunction(()=>Boolean(window.__MOSS_MARBLE__?.startEndless),null,{timeout:15000});
  for(const seed of [17,817,9135,81357]){
    const snapshot=await page.evaluate(seed=>{
      const g=window.__MOSS_MARBLE__;
      g.startEndless({fresh:true,seed});
      g.toggleOverview();
      return g.snapshot();
    },seed);
    expect(snapshot.mode).toBe('playing');
    expect(snapshot.endlessActive).toBe(true);
    expect(snapshot.level.section).toBe(1);
    expect(snapshot.strokes).toBe(0);
    await expect(page.locator('#courseName')).toHaveText(snapshot.level.name);
    await page.waitForTimeout(520);
    const dims=await page.evaluate(()=>({
      overflow:document.documentElement.scrollWidth-innerWidth,
      game:document.querySelector('#game')?.getBoundingClientRect().toJSON()
    }));
    expect(dims.overflow).toBeLessThanOrEqual(8);
    expect(dims.game.width).toBeGreaterThan(250);
    expect(dims.game.height).toBeGreaterThan(300);
    await page.screenshot({
      path:join(folder,`seed-${seed}-overview.png`),animations:'disabled'
    });
    if(seed===817){
      await page.evaluate(()=>window.__MOSS_MARBLE__.toggleOverview());
      await page.waitForTimeout(530);
      await page.screenshot({
        path:join(folder,'seed-817-follow.png'),animations:'disabled'
      });
    }
  }
  expect(errors,errors.join('\n')).toEqual([]);
});
