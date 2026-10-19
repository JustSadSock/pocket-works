import {test,expect} from '@playwright/test';
import {join} from 'node:path';
import {mkdirSync} from 'node:fs';

test('live shooting produces resolved shots, misses and remains pausible',async ({page,isMobile,browserName},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/apps/meat-exe/');
  await page.locator('#startBtn').click();
  await expect(page.locator('#hud')).toBeVisible();
  const initial=await page.evaluate(()=>window.__MEAT_QA__?.());
  expect(initial.combat.shotsFired).toBe(0);
  if(isMobile){
    await page.locator('#fireBtn').tap();
  }else{
    const surface=page.locator('#stage');
    await surface.click({position:{x:400,y:340},noWaitAfter:true}); // first click now fires and captures the mouse
    await page.mouse.down();await page.mouse.up(); // now a real primary-fire gesture
  }
  await expect.poll(()=>page.evaluate(()=>window.__MEAT_QA__?.().combat.shotsFired),{timeout:7000}).toBeGreaterThan(0);
  const result=await page.evaluate(()=>window.__MEAT_QA__?.());
  expect(['wall','miss','flesh']).toContain(result.combat.lastShotKind);
  expect(result.mode).toBe('playing');
  const dir=process.env.PW_QA_OUTPUT_DIR;
  if(dir){mkdirSync(dir,{recursive:true});await page.screenshot({path:join(dir,`combat-${browserName}-${isMobile?'mobile':'desktop'}.png`)});}
  if(isMobile)await page.locator('#pauseBtn').click();
  else await page.keyboard.press('Escape');
  await expect(page.locator('#pauseMenu')).toBeVisible();
  expect(errors).toEqual([]);
});
test('the two guns differ and can be swapped during gameplay',async ({page,isMobile})=>{
  await page.goto('/apps/meat-exe/');
  await page.locator('#startBtn').click();
  await expect(page.locator('#weaponValue')).toContainText('КОСТОЛОМ');
  if(isMobile)await page.locator('#weaponBtn').tap();else await page.keyboard.press('q');
  await expect(page.locator('#weaponValue')).toContainText('МЯСОРУБКА');
  await page.locator('#pauseBtn').click();
  await expect(page.locator('#pauseMenu')).toBeVisible();
});
