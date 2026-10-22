import { expect, test } from '@playwright/test';

async function enterEditor(page:import('@playwright/test').Page){
 await page.goto('/apps/komnatka/?qa=1',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#homeSolo')).toBeVisible({timeout:30_000});
 await page.locator('#homeSolo').click();
 await page.waitForFunction(()=>(window as any).__KOMNATKA_TEST__?.stageReady===true,undefined,{timeout:30_000});
 await expect(page.locator('#homeScreen')).toBeHidden();
}

test('visible wallpaper control changes both actual Babylon walls, floors and saved rooms',async ({page})=>{
 test.setTimeout(150_000);
 await page.setViewportSize({width:1440,height:900});
 await enterEditor(page);
 await expect(page.locator('#wallpaperShortcut')).toBeVisible();
 await expect(page.locator('#roomsButton')).toBeVisible();
 await page.locator('#wallpaperShortcut').click();
 await expect(page.locator('#finish [data-pattern="stripe"]')).toBeVisible();
 await expect(page.locator('#finish [data-pattern-left="flower"]')).toBeVisible();
 await expect(page.locator('#finish [data-pattern="stripe"] img')).toHaveAttribute('src',/^data:image\/jpeg/);
 await page.locator('#finish [data-pattern="stripe"]').click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__KOMNATKA_TEST__.finishState.pattern)).toBe('stripe');
 await expect.poll(()=>page.evaluate(()=>(window as any).__KOMNATKA_TEST__.renderedWallpaper.back)).toContain('stripe');
 await page.locator('#finish [data-pattern-left="flower"]').click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__KOMNATKA_TEST__.renderedWallpaper.left)).toContain('flower');
 await page.locator('#categories [data-group="floor"]').click();
 await page.locator('#finish [data-floor="tile"]').click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__KOMNATKA_TEST__.finishState.floor)).toBe('tile');
 // The room collection is usable from the scene itself, not via the home screen.
 await page.locator('#roomsButton').click();
 await expect(page.locator('#roomsLayer')).toBeVisible();
 await expect(page.locator('#roomsBack')).toHaveText('← В редактор');
 await page.locator('#addAlbum').click();
 await page.locator('#newRoomPurposes [data-purpose="kitchen"]').click();
 await page.locator('#roomCreateConfirm').click();
 await expect(page.locator('#roomsLayer')).toBeHidden();
 await expect.poll(()=>page.evaluate(()=>(window as any).__KOMNATKA_TEST__.purpose)).toBe('kitchen');
 await expect.poll(()=>page.evaluate(()=>(window as any).__KOMNATKA_TEST__.savedRooms.length)).toBe(2);
 await expect(page.locator('#activeRoomLabel')).toHaveText('Новая комнатка');
 await page.locator('#roomsButton').click();
 await expect(page.locator('#roomsGrid [data-open="first"]')).toBeVisible();
 await page.locator('#roomsGrid [data-open="first"]').click();
 await expect(page.locator('#roomsLayer')).toBeHidden();
 await expect.poll(()=>page.evaluate(()=>(window as any).__KOMNATKA_TEST__.finishState.pattern)).toBe('stripe');
 await expect.poll(()=>page.evaluate(()=>(window as any).__KOMNATKA_TEST__.finishState.patternLeft)).toBe('flower');
 await expect.poll(()=>page.evaluate(()=>(window as any).__KOMNATKA_TEST__.finishState.floor)).toBe('tile');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#homeSolo').click();
 await page.waitForFunction(()=>(window as any).__KOMNATKA_TEST__?.stageReady===true);
 await expect.poll(()=>page.evaluate(()=>(window as any).__KOMNATKA_TEST__.savedRooms.length)).toBe(2);
 await expect.poll(()=>page.evaluate(()=>(window as any).__KOMNATKA_TEST__.finishState.pattern)).toBe('stripe');
});

test('wallpaper and saved-room shortcuts remain reachable on narrow mobile viewports',async ({page})=>{
 test.setTimeout(100_000);
 await page.setViewportSize({width:375,height:780});
 await enterEditor(page);
 await expect(page.locator('#roomsButton')).toBeVisible();
 await expect(page.locator('#wallpaperShortcut')).toBeVisible();
 for(const selector of ['#roomsButton','#wallpaperShortcut']){
  const fits=await page.locator(selector).evaluate(el=>{
   const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0;
  });
  expect(fits,selector+' must remain on screen').toBe(true);
 }
 await page.locator('#wallpaperShortcut').click();
 await expect(page.locator('#finish [data-pattern="stripe"]')).toBeVisible();
 await page.locator('#finish [data-pattern="stripe"]').click();
 expect(await page.evaluate(()=>(window as any).__KOMNATKA_TEST__.finishState.pattern)).toBe('stripe');
 await page.locator('#roomsButton').click();
 await expect(page.locator('#addAlbum')).toBeVisible();
 await page.locator('#roomsBack').click();
 await expect(page.locator('#roomsLayer')).toBeHidden();
 await expect(page.locator('#homeScreen')).toBeHidden();
});
