import {test,expect} from '@playwright/test';

test('initialization releases buttons, settings train real agent and re-enables after training',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#cpTrain')).toBeEnabled({timeout:12000});
 await expect(page.locator('#cpQuickScenario')).toBeEnabled();
 await expect(page.locator('#cpQuickBatch')).toBeEnabled();
 await expect(page.locator('#cpAgent option')).toHaveCount(1);
 await page.locator('#cpQuickScenario').selectOption('corridor');
 await page.locator('#cpQuickBatch').selectOption('100');
 await page.locator('#cpTrain').click();
 await expect(page.locator('#hubRuns')).toHaveText('1',{timeout:45000});
 await expect(page.locator('#cpTrain')).toBeEnabled({timeout:12000});
 await expect(page.locator('#cpTrainingCount')).toContainText('1 тренировка');
 await page.locator('#cpTest').click();
 await expect(page.locator('#cpTest')).toBeEnabled({timeout:45000});
 expect(errors).toEqual([]);
});

test('switching agents and worlds never leaves cockpit disabled',async({page})=>{
 test.setTimeout(90000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#cpTrain')).toBeEnabled({timeout:12000});
 await page.locator('[data-cp-mode="combat"]').click();
 await expect(page.locator('#cpTrain')).toBeEnabled({timeout:12000});
 await page.locator('[data-cp-mode="grid"]').click();
 await expect(page.locator('#cpTrain')).toBeEnabled({timeout:12000});
 await page.locator('#cpProfile').click();
 await page.locator('#cpCreate').click();
 await page.locator('#hubDialogName').fill('Второй агент');
 await page.locator('#hubDialogConfirm').click();
 await expect(page.locator('#cpAgent option')).toHaveCount(2,{timeout:15000});
 await expect(page.locator('#cpTrain')).toBeEnabled({timeout:12000});
 expect(errors).toEqual([]);
});

for(const viewport of [{width:1280,height:800},{width:390,height:844},{width:844,height:390}]){
 test('workspace uses field and useful controls at '+viewport.width+'x'+viewport.height,async({browser})=>{
  const ctx=await browser.newContext({viewport,serviceWorkers:'block',isMobile:viewport.width===390,hasTouch:viewport.width===390});
  try{
   const page=await ctx.newPage();
   await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
   await expect(page.locator('#cpTrain')).toBeEnabled({timeout:12000});
   await expect(page.locator('#cpQuickScenario')).toBeVisible();
   await expect(page.locator('#cpQuickBatch')).toBeVisible();
   await expect(page.locator('#cpTrainingCount')).toBeVisible();
   const bounds=await page.evaluate(()=>{
    const field=document.querySelector('#worldPanel').getBoundingClientRect();
    const controls=document.querySelector('#agentHub').getBoundingClientRect();
    return {field:{width:field.width,height:field.height},controls:{width:controls.width,height:controls.height},scrollWidth:document.documentElement.scrollWidth};
   });
   expect(bounds.scrollWidth).toBeLessThanOrEqual(viewport.width+3);
   expect(bounds.field.width).toBeGreaterThan(viewport.width>900?700:210);
   expect(bounds.field.height).toBeGreaterThan(120);
  }finally{await ctx.close();}
 });
}