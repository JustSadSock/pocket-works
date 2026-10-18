import {test,expect} from '@playwright/test';

test('living organ loads, procedural tissue state survives pause, refresh and resume',async ({page,isMobile})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/meat-exe/');
 await page.locator('#startBtn').click();
 await expect(page.locator('#hud')).toBeVisible();
 let run=await page.evaluate(()=>window.__MEAT_QA__?.());
 expect(run.anatomy).toBeDefined();expect(run.anatomy.ruptures).toBe(0);
 expect(run.anatomy.immuneHeat).toBe(0);
 if(isMobile)await page.locator('#fireBtn').tap();
 else await page.locator('#stage').click({position:{x:350,y:250}});
 await expect.poll(()=>page.evaluate(()=>window.__MEAT_QA__?.().combat.shotsFired)).toBeGreaterThan(0);
 if(isMobile)await page.locator('#pauseBtn').click();
 else await page.keyboard.press('Escape');
 await expect(page.locator('#pauseMenu')).toBeVisible();
 await page.locator('#menuPause').click();
 await expect(page.locator('#resumeSaved')).toBeVisible();
 await page.reload();
 await expect(page.locator('#resumeSaved')).toBeVisible();
 await page.locator('#resumeSaved').click();
 run=await page.evaluate(()=>window.__MEAT_QA__?.());
 expect(run.mode).toBe('playing');expect(run.anatomy).toBeDefined();
 expect(errors).toEqual([]);
});
