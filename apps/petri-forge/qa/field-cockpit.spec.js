import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('one prominent field, compact dock, separate simulation and personal agent tools',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#cockpit')).toBeVisible();
 await expect(page.locator('#cv')).toBeVisible();
 await expect(page.locator('#labPanel')).toBeHidden();
 await expect(page.locator('#cpScenario')).toBeHidden();
 await expect(page.locator('#cpTrain')).toBeVisible();
 await expect(page.locator('#cpQuickScenario')).toBeVisible();
 await page.locator('#cpQuickScenario').selectOption('hazards');
 await page.locator('#cpQuickBatch').selectOption('100');
 await expect(page.locator('#cpGoal')).toContainText('Опасная');
 await page.locator('#cpTrain').click();
 await expect(page.locator('#hubRuns')).toHaveText('1',{timeout:45000});
 await expect(page.locator('#cpTrain')).toBeVisible();
 await page.locator('[data-cp-mode="combat"]').click();
 await expect(page.locator('#battleCanvas')).toBeVisible();
 await expect(page.locator('#cpTrain')).toBeVisible();
 await expect(page.locator('#cpGoal')).toContainText('Укрытия');
 await page.locator('#cpExpert').click();
 await expect(page.locator('#combatPanel')).toBeVisible();
 await expect(page.locator('#cockpit')).toBeHidden();
 await page.locator('#combatPanel .hub-back').click();
 await expect(page.locator('#cockpit')).toBeVisible();
 expect(errors).toEqual([]);
});

test('export whole agent, import as a distinct preserved identity',async({page})=>{
 test.setTimeout(85000);
 await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#cpAgent option')).toHaveCount(1,{timeout:22000});
 await page.locator('#cpQuickBatch').selectOption('100');
 await page.locator('#cpTrain').click();
 await expect(page.locator('#hubRuns')).toHaveText('1',{timeout:45000});
 await page.locator('#cpProfile').click();
 const [download]=await Promise.all([
  page.waitForEvent('download'),page.locator('#cpExport').click()
 ]);
 const file=await download.path(),body=JSON.parse(await readFile(file,'utf8'));
 expect(body.format).toBe('petri-forge-career');
 expect(body.brains.grid.q.length).toBeGreaterThan(0);
 await page.locator('#cpImportFile').setInputFiles(file);
 await expect(page.locator('#cpAgent option')).toHaveCount(2,{timeout:20000});
 await page.locator('#cpProfileDialog [data-cp-close]').click();
 await expect(page.locator('#hubRuns')).toHaveText('1');
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('#cpAgent option')).toHaveCount(2,{timeout:20000});
});

test('two distinct trained agent policies fight on original Combat Forge rules',async({page})=>{
 test.setTimeout(120000);
 await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#cpAgent option')).toHaveCount(1,{timeout:22000});
 await page.locator('[data-cp-mode="combat"]').click();
 await page.locator('#cpQuickBatch').selectOption('8');
 await page.locator('#cpTrain').click();
 await expect(page.locator('#hubRuns')).toHaveText('1',{timeout:55000});
 const first=await page.locator('#cpAgent').inputValue();
 await page.locator('#cpProfile').click();
 await page.locator('#cpCreate').click();
 await page.locator('#hubDialogName').fill('Второй боец');
 await page.locator('#hubDialogConfirm').click();
 await expect(page.locator('#cpAgent option')).toHaveCount(2,{timeout:15000});
 await page.locator('#cpTrain').click();
 await expect(page.locator('#hubRuns')).toHaveText('1',{timeout:55000});
 await page.locator('#cpDuel').click();
 await expect(page.locator('#cpFight')).toBeEnabled();
 await page.locator('#cpDuelA').selectOption(first);
 await page.locator('#cpDuelB').selectOption({label:'Второй боец'});
 await page.locator('#cpFight').click();
 await expect(page.locator('#battleSeek')).toBeEnabled({timeout:35000});
 await expect(page.locator('#battleSummary')).toContainText('Победа:');
});
for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1280,height:800}]){
 test('cockpit remains on-screen '+viewport.width+'x'+viewport.height,async({browser})=>{
  const context=await browser.newContext({viewport,hasTouch:viewport.width<900,isMobile:viewport.width<900,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
   await expect(page.locator('#cockpit')).toBeVisible();
   await expect(page.locator('#cpTrain')).toBeVisible();
   await expect(page.locator('#cv')).toBeVisible();
   const dims=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,field:document.querySelector('#cv').getBoundingClientRect().width}));
   expect(dims.scroll).toBeLessThanOrEqual(viewport.width+3);
   expect(dims.field).toBeGreaterThan(140);
   await page.locator('#cpProfile').click();
   await expect(page.locator('#cpExport')).toBeVisible();
   expect(errors).toEqual([]);
  }finally{await context.close();}
 });
}