import {test,expect} from '@playwright/test';

// Short, device-diverse browser acceptance checks for previously discovered
// input/context-priority regressions. They exercise the real shipped app.
async function boot(page,url){
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__PW_TEST_STATE__?.renderer3D,{timeout:30000});
 await page.locator('#start').click();
 await page.waitForFunction(()=>window.__PW_TEST_STATE__?.phase==='play',{timeout:30000})
}
async function activateInteraction(page){
 if(await page.locator('#interact').isVisible())await page.locator('#interact').click();
 else await page.keyboard.press('e')
}
test('fuse interaction wins over neighboring hotspots after a kitchen blackout',async({page})=>{
 test.setTimeout(90000);
 await boot(page,'/apps/not-dead-yet/?chapter=1&qa=1');
 expect(await page.evaluate(()=>window.__PW_TEST_HOOKS__.triggerBlackout())).toBe(true);
 await expect.poll(()=>page.evaluate(()=>window.__PW_TEST_STATE__.power.stage)).toBe('tripped');
 expect(await page.evaluate(()=>window.__PW_TEST_HOOKS__.teleportNearPower('fuse'))).toBe(true);
 await expect(page.locator('#interact')).toHaveText('Включить');
 await activateInteraction(page);
 expect(await page.evaluate(()=>window.__PW_TEST_STATE__.power.stage)).toBe('tripped');
 expect(await page.evaluate(()=>window.__PW_TEST_HOOKS__.teleportNearPower('plate'))).toBe(true);
 await expect(page.locator('#interact')).toHaveText('Выключить');
 await activateInteraction(page);
 await expect.poll(()=>page.evaluate(()=>window.__PW_TEST_STATE__.power.stage)).toBe('safe');
 await page.locator('#pause').click();
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#continue').click();
 await page.waitForFunction(()=>window.__PW_TEST_STATE__?.phase==='play');
 expect(await page.evaluate(()=>window.__PW_TEST_HOOKS__.teleportNearPower('fuse'))).toBe(true);
 await expect(page.locator('#interact')).toHaveText('Включить');
 await activateInteraction(page);
 await expect.poll(()=>page.evaluate(()=>window.__PW_TEST_STATE__.power.stage),{timeout:12000}).toBe('restored')
});
test('arrow-right rotates camera on slow WebGL and Escape returns to live play',async({page})=>{
 test.setTimeout(90000);
 await boot(page,'/apps/not-dead-yet/?qa=1');
 const initial=await page.evaluate(()=>window.__PW_TEST_STATE__.position.yaw);
 await page.keyboard.down('ArrowRight');
 try{
  await expect.poll(async()=>{
   const yaw=await page.evaluate(()=>window.__PW_TEST_STATE__.position.yaw);
   return Math.atan2(Math.sin(yaw-initial),Math.cos(yaw-initial))
  },{timeout:12000,intervals:[40,75,100]}).toBeGreaterThan(.12)
 }finally{await page.keyboard.up('ArrowRight')}
 await page.keyboard.press('Escape');
 await expect(page.locator('#pauseOverlay')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.locator('#pauseOverlay')).toBeHidden();
 await page.waitForFunction(()=>window.__PW_TEST_STATE__?.phase==='play',{timeout:12000})
});
