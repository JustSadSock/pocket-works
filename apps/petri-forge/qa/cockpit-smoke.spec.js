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
test('Perekos controller is ready before any replay and survives switching agents',async({page})=>{
 test.setTimeout(60000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#cpTrain')).toBeEnabled({timeout:15000});
 await expect.poll(async()=>page.evaluate(()=>typeof window.PetriForgeRuntime?.perekos?.setModel)).toBe('function');
 await page.locator('[data-cp-mode="perekos"]').click();
 await expect(page.locator('#cpTrain')).toBeEnabled({timeout:20000});
 const first=await page.evaluate(()=>window.PetriForgeRuntime.perekos.getModel());
 expect(first.type||first.version).toBeTruthy();
 await page.locator('#cpProfile').click();
 await page.locator('#cpCreate').click();
 await page.locator('#hubDialogName').fill('Маг проверки');
 await page.locator('#hubDialogConfirm').click();
 await expect(page.locator('#cpAgent option')).toHaveCount(2,{timeout:15000});
 await expect(page.locator('#cpTrain')).toBeEnabled({timeout:20000});
 const second=await page.evaluate(()=>window.PetriForgeRuntime.perekos.getModel());
 expect(second).toBeTruthy();
 expect(errors).toEqual([]);
});

test('specimen library clones and archives real training without losing either brain',async({page})=>{
 test.setTimeout(90000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#cpTrain')).toBeEnabled({timeout:15000});
 await page.locator('#cpQuickBatch').selectOption('100');
 await page.locator('#cpTrain').click();
 await expect(page.locator('#hubRuns')).toHaveText('1',{timeout:45000});
 const initial=await page.evaluate(()=>window.PetriForgeRuntime.grid.getModel());
 expect(initial.q.length).toBeGreaterThan(0);
 await page.locator('#cpProfile').click();
 await expect(page.locator('.cp-specimen')).toHaveCount(1);
 await expect(page.locator('.cp-specimen .cp-specimen-skills')).toContainText('Мир: 1');
 await page.locator('.cp-specimen').getByRole('button',{name:'Клон'}).click();
 await expect(page.locator('#cpAgent option')).toHaveCount(2,{timeout:12000});
 await expect(page.locator('.cp-specimen')).toHaveCount(2);
 const cloned=await page.evaluate(()=>window.PetriForgeRuntime.grid.getModel());
 expect(cloned.q).toEqual(initial.q);
 await page.locator('.cp-specimen-selected').getByRole('button',{name:'В архив'}).click();
 await expect(page.locator('.cp-specimen')).toHaveCount(1);
 await page.locator('#cpShowArchived').click();
 await expect(page.locator('.cp-specimen')).toHaveCount(1);
 await expect(page.locator('.cp-specimen')).toContainText('Копия');
 await page.locator('.cp-specimen').getByRole('button',{name:'Восстановить'}).click();
 await page.locator('#cpShowActive').click();
 await expect(page.locator('.cp-specimen')).toHaveCount(2);
 await page.locator('#cpProfileDialog [data-cp-close]').click();
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('#cpAgent option')).toHaveCount(2,{timeout:20000});
 await page.locator('#cpInspect').click();
 await expect(page.locator('#cpObserver')).toBeVisible();
 await expect(page.locator('#cpObserverModel')).toContainText('изученных состояний');
 await page.locator('#cpVision').click();
 await expect(page.locator('#cpVision')).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>window.PetriForgeRuntime.grid.setObservationOverlay(false))).toBe(false);
 expect(errors).toEqual([]);
});

test('real neural actor-critic trains, saves, restores and preserves the separate Q brain',async({page})=>{
 test.setTimeout(120000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#cpTrain')).toBeEnabled({timeout:20000});
 expect((await page.evaluate(()=>window.PetriForgeRuntime.grid.getModel())).type).toBe('qlearning');
 await page.locator('#cpAlgorithm').selectOption('neural');
 await expect.poll(async()=>page.evaluate(()=>window.PetriForgeRuntime.grid.getModel().then(m=>m.type))).toBe('neural-actor-critic');
 await expect(page.locator('#cpTrain')).toBeEnabled();
 await page.locator('#cpQuickBatch').selectOption('100');
 await page.locator('#cpTrain').click();
 await expect(page.locator('#hubRuns')).toHaveText('1',{timeout:85000});
 const learned=await page.evaluate(()=>window.PetriForgeRuntime.grid.getModel());
 expect(learned.type).toBe('neural-actor-critic');
 expect(learned.updates).toBeGreaterThan(0);
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('#cpTrain')).toBeEnabled({timeout:20000});
 await expect(page.locator('#cpAlgorithm')).toHaveValue('neural');
 const reloaded=await page.evaluate(()=>window.PetriForgeRuntime.grid.getModel());
 expect(reloaded).toEqual(learned);
 await page.locator('#cpInspect').click();
 await expect(page.locator('#cpObserverModel')).toContainText('весов');
 await page.locator('#cpAlgorithm').selectOption('qlearning');
 await expect.poll(async()=>page.evaluate(()=>window.PetriForgeRuntime.grid.getModel().then(m=>m.type))).toBe('qlearning');
 await page.locator('#cpAlgorithm').selectOption('neural');
 await expect.poll(async()=>page.evaluate(()=>window.PetriForgeRuntime.grid.getModel().then(m=>m.type))).toBe('neural-actor-critic');
 const swapped=await page.evaluate(()=>window.PetriForgeRuntime.grid.getModel());
 expect(swapped).toEqual(learned);
 expect(errors).toEqual([]);
});
