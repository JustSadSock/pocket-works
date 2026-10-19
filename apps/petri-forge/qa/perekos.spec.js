import {test,expect} from '@playwright/test';
test('native Perekos training station plays, replays and saves brains',async({page})=>{
 test.setTimeout(180000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('[data-world-mode]')).toHaveCount(4);
 await page.locator('[data-world-mode="perekos"]').click();
 await expect(page.locator('#pkCanvas')).toBeVisible();
 await expect(page.locator('#pkCurriculum')).toBeVisible();
 await expect(page.locator('#pkLearningChart')).toBeVisible();
 await expect(page.locator('#pkValidation')).toContainText('Контрольный матч',{timeout:50000});
 await expect(page.locator('#pkPlay')).toBeEnabled();
 const before=await page.evaluate(()=>window.petriForgePerekosDiagnostics());
 expect(before.frames).toBeGreaterThan(3);
 await page.locator('#pkPlay').click();
 await expect(page.locator('#pkPlay')).toContainText('Пауза');
 await page.locator('#pkPlay').click();
 await page.locator('#pkSeek').evaluate(el=>{el.value='5';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.locator('#pkName').fill('QA Ruin Mage');
 await page.locator('#pkSave').click();
 await expect(page.locator('#pkModels')).toContainText('QA Ruin Mage');
 await page.locator('#pkGenerations').selectOption('2');
 await page.locator('#pkCurriculum').selectOption('balanced');
 await page.locator('#pkTrain').click();
 await expect(page.locator('#pkStop')).toBeEnabled();
 await expect(page.locator('#pkStop')).toBeDisabled({timeout:150000});
 await expect(page.locator('#pkValidation')).toContainText('Независимая проверка:');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('[data-world-mode="perekos"]').click();
 await page.locator('#pkModels').selectOption({label:'QA Ruin Mage'});
 await page.locator('#pkLoad').click();
 await expect(page.locator('#pkStatus')).toContainText('загружен',{ignoreCase:true});
 expect(errors).toEqual([]);
});
test('cross-game combat policy can transfer as a Perekos heuristic',async({page})=>{
 await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
 await page.locator('[data-world-mode="combat"]').click();
 await page.locator('#battleName').fill('Transfer QA');
 await page.locator('#battleSave').click();
 await page.locator('[data-world-mode="perekos"]').click();
 await expect(page.locator('#pkTransferModels')).toContainText('Transfer QA');
 await page.locator('#pkTransferModels').selectOption({label:'Transfer QA'});
 await page.locator('#pkCompareTransfer').click();
 await expect(page.locator('#pkTransferInfo')).toContainText('Сравнение на одинаковых контрольных раундах',{timeout:60000});
 await page.locator('#pkTransfer').click();
 await expect(page.locator('#pkTransferInfo')).toContainText('эвристически');
 await expect.poll(async()=> (await page.evaluate(()=>window.petriForgePerekosDiagnostics())).policySource,{timeout:12000}).toBe('heuristic-transfer');
});
for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1280,height:800}]){
 test('Perekos training controls accessible '+viewport.width+'×'+viewport.height,async({browser})=>{
  const context=await browser.newContext({viewport,hasTouch:viewport.width<900,isMobile:viewport.width<900,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
   await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
   await page.locator('[data-world-mode="perekos"]').click();
   await expect(page.locator('#pkCanvas')).toBeVisible();
   await page.locator('#pkTrain').scrollIntoViewIfNeeded();
   const scrollWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
   expect(scrollWidth).toBeLessThanOrEqual(viewport.width+3);
   expect(errors).toEqual([]);
  }finally{await context.close();}
 });
}
