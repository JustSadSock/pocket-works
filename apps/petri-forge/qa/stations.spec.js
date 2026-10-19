import {test,expect} from '@playwright/test';

test('Combat Forge opens, resolves a real duel, changes arenas, renders 2v2',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('[data-world="combat"]')).toBeVisible({timeout:15000});
 await page.locator('[data-world="combat"]').click();
 await expect(page.locator('#combatCanvas')).toBeVisible();
 await expect(page.locator('#combatCaption')).toContainText('1×1');
 await page.locator('#combatTeams').selectOption('2');
 await expect(page.locator('#combatCaption')).toContainText('2×2');
 await page.locator('#combatArena').selectOption('hazards');
 await expect(page.locator('#combatResult')).toContainText('Итог');
 await page.locator('#combatPause').click();
 await page.locator('#combatStep').click();
 await page.locator('#combatSpeed').click();
 await expect(page.locator('#combatSpeed')).toContainText('3×');
 await page.locator('#combatSave').click();
 await expect(page.locator('#combatLibrary option')).not.toHaveCount(1,{timeout:12000});
 await page.locator('[data-world="grid"]').click();
 await expect(page.locator('#cv')).toBeVisible();
 expect(errors).toEqual([]);
});
test('Combat Forge performs training, saves the checkpoint and evaluates',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
 await page.locator('[data-world="combat"]').click();
 await page.locator('#combatArena').selectOption('open');
 await page.locator('#combatIterations').selectOption('12');
 await page.locator('#combatTrain').click();
 await expect(page.locator('#combatStop')).toBeEnabled();
 await expect(page.locator('#combatStop')).toBeDisabled({timeout:90000});
 await expect(page.locator('#combatProgress')).not.toContainText('0');
 await expect(page.locator('#combatLibrary option')).not.toHaveCount(1,{timeout:15000});
 await page.locator('#combatEvaluate').click();
 await expect(page.locator('#combatResult')).toContainText('Новые seed',{timeout:30000});
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('[data-world="combat"]').click();
 await page.locator('#combatLibrary').selectOption('combat-autosave');
 await page.locator('#combatLoad').click();
 await expect(page.locator('#status')).toContainText('загружен');
 expect(errors).toEqual([]);
});
test('Shpilka adapter loads the real game inside the station',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
 await page.locator('[data-world="race"]').click();
 await expect(page.locator('#shpilkaFrame')).toBeVisible();
 await expect(page.locator('#raceResults')).toContainText('Настоящая физика',{timeout:35000});
 await page.locator('#raceSave').click();
 await expect(page.locator('#raceLibrary option')).not.toHaveCount(1,{timeout:15000});
 await page.locator('#raceIterations').selectOption('5');
 await page.locator('#raceEvaluate').click();
 await expect(page.locator('#raceResults')).toContainText('Контрольный заезд',{timeout:60000});
 expect(errors).toEqual([]);
});
for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1280,height:800}]){
 test('all stations visible without horizontal overflow '+viewport.width+'×'+viewport.height,async({browser})=>{
  const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:viewport.width<900,hasTouch:viewport.width<900,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
   await expect(page.locator('[data-world="combat"]')).toBeVisible();
   await page.locator('[data-world="combat"]').click();
   await expect(page.locator('#combatCanvas')).toBeVisible();
   await page.locator('#combatTrain').scrollIntoViewIfNeeded();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width+4);
   expect(errors).toEqual([]);
  }finally{await context.close();}
 });
}
