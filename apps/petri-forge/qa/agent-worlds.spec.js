import {test,expect} from '@playwright/test';

test('combat agents fight in custom 2v2 and save their learned brain',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('[data-cp-mode="combat"]')).toBeVisible();
 await page.locator('[data-cp-mode="combat"]:visible, [data-world-mode="combat"]:visible').first().click();
 await expect(page.locator('#battleCanvas')).toBeVisible();
 await page.locator('#cpExpert').click();
 await expect(page.locator('#combatPanel')).toBeVisible();
 await page.locator('#battleTeamSize').selectOption('2');
 await page.locator('#battleArena').selectOption('hazards');
 await page.locator('#battleSkills0 input[value="shield"]').check();
 await page.locator('#battleSkills0 input[value="mine"]').uncheck();
 await page.locator('#battleTest').click();
 await expect(page.locator('#battleSummary')).toContainText('Победа:',{timeout:15000});
 await expect(page.locator('#battlePlay')).toBeEnabled();
 await page.locator('#battleIterations').selectOption('8');
 await page.locator('#battleTrain').click();
 await expect(page.locator('#battleStop')).toBeEnabled();
 await expect(page.locator('#battleStop')).toBeDisabled({timeout:80000});
 await expect(page.locator('#battleValidation')).toContainText('Контрольная серия');
 await page.locator('#battleName').fill('QA Gladiator');
 await page.locator('#battleSave').click();
 await expect(page.locator('#battleModels')).toContainText('QA Gladiator');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('[data-cp-mode="combat"]:visible, [data-world-mode="combat"]:visible').first().click();
 await page.locator('#cpExpert').click();
 await page.locator('#battleModels').selectOption({label:'QA Gladiator'});
 await page.locator('#battleLoad').click();
 await expect(page.locator('#modeStatus')).toContainText('мозг загружен',{ignoreCase:true});
 expect(errors).toEqual([]);
});
test('Shpilka bridge loads real physics and completes a test drive',async({page})=>{
 test.setTimeout(120000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
 await page.locator('[data-cp-mode="race"]:visible, [data-world-mode="race"]:visible').first().click();
 await expect(page.locator('#raceFrame')).toBeVisible();
 await page.locator('#cpExpert').click();
 await expect(page.locator('#raceConnect')).toContainText('подключена',{timeout:45000});
 await expect(page.locator('#raceTrain')).toBeEnabled();
 await page.locator('#raceTest').click();
 await expect(page.locator('#raceReport')).toContainText('Проверка',{timeout:90000});
 await expect(page.locator('#raceSeek')).toBeEnabled();
 expect(errors).toEqual([]);
});
for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1280,height:800}]){
 test('combat and driving panels fit '+viewport.width+' × '+viewport.height,async({browser})=>{
  const context=await browser.newContext({viewport,hasTouch:viewport.width<900,isMobile:viewport.width<900,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
   await page.locator('[data-cp-mode="combat"]:visible, [data-world-mode="combat"]:visible').first().click();
   await expect(page.locator('#battleCanvas')).toBeVisible();
   await page.locator('#cpTrain').scrollIntoViewIfNeeded();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width+3);
   await page.locator('[data-cp-mode="race"]:visible, [data-world-mode="race"]:visible').first().click();
   await expect(page.locator('#raceFrame')).toBeVisible();
   await page.locator('#cpTrain').scrollIntoViewIfNeeded();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width+3);
   expect(errors).toEqual([]);
  }finally{await context.close();}
 });
}
