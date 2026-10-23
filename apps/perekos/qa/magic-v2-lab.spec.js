import {test,expect} from '@playwright/test';

test('v2 new magic is a real class-free school selection, combat and sealed rune editing loop',async({page})=>{
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await page.locator('#open-v2-lab').click();
 await expect(page.locator('#magic-v2')).toBeVisible();
 await expect(page.locator('.v2-school')).toHaveCount(3);
 await page.locator('.v2-school.v2-fire').click();
 await expect(page.locator('.v2-kicker')).toContainText('Огонь');
 expect(await page.evaluate(()=>window.__perekosTest.state.magicSchool)).toBe('fire');
 const tab=page.locator('.v2-tab').nth(1);
 await tab.click();
 const castCard=page.locator('.v2-card').filter({hasText:'При выстреле'}).first();
 await castCard.click();
 await page.locator('.v2-reserve-item').filter({hasText:'При выстреле'}).locator('.v2-equip').first().click();
 const guardCard=page.locator('.v2-card').filter({hasText:'Защититься'}).first();
 await guardCard.click();
 await page.locator('.v2-reserve-item').filter({hasText:'Защититься'}).locator('.v2-equip').first().click();
 await expect(page.locator('.v2-editor .v2-installed')).toHaveCount(2);
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('.v2-seal').click();
 await expect(page.locator('.v2-sealed')).toHaveCount(1);
 expect(await page.evaluate(()=>window.__perekosTest.state.magicLoadouts[0].slots[1].actions.length)).toBe(0);
 await page.locator('.v2-play').click();
 await expect(page.locator('#controls')).toBeHidden();
 await expect(page.locator('#forge-edit')).toBeVisible();
 await expect(page.locator('#special-btn')).toBeHidden();
 await page.keyboard.down('Space');await page.waitForTimeout(170);await page.keyboard.up('Space');
 expect(await page.evaluate(()=>window.__perekosTest.state.actors[0].shield)).toBeGreaterThan(0);
 await page.locator('#forge-edit').click();
 await expect(page.locator('#magic-v2')).toBeVisible();
 await expect(page.locator('.v2-sealed')).toHaveCount(1);
 expect(await page.evaluate(()=>window.__perekosTest.state.magicLoadouts[0].sealed.length)).toBe(1);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#continue').click();
 await expect(page.locator('#magic-v2')).toBeVisible();
 await expect(page.locator('.v2-sealed')).toHaveCount(1);
});

test('v2 mobile scrollport keeps menu, rune lab and physical arena accessible',async({browser},testInfo)=>{
 for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,serviceWorkers:'block'});
  try{
   const page=await context.newPage();
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
   await page.locator('#open-v2-lab').click();
   await expect(page.locator('#magic-v2')).toBeVisible();
   await page.locator('.v2-school.v2-stone').click();
   const rect=await page.locator('.v2-stage').boundingBox();
   expect(rect.width).toBeGreaterThan(100);
   expect(rect.x).toBeGreaterThanOrEqual(-1);
   expect(rect.x+rect.width).toBeLessThanOrEqual(viewport.width+1);
   expect(rect.y+rect.height).toBeLessThanOrEqual(viewport.height+1);
   await page.locator('.v2-play').click();
   await expect(page.locator('#controls')).toBeVisible();
   await expect(page.locator('#special-btn')).toBeHidden();
   const canvas=await page.locator('#world').boundingBox(),hud=await page.locator('#hud').boundingBox();
   expect(canvas.y).toBeGreaterThanOrEqual(hud.y+hud.height-.5);
   await page.locator('#forge-edit').click();
   await expect(page.locator('#magic-v2')).toBeVisible();
   expect(errors).toEqual([]);
   await testInfo.attach('magic-v2-'+viewport.width+'x'+viewport.height,{body:await page.screenshot(),contentType:'image/png'});
  }finally{await context.close()}
 }
});
