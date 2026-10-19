import {test,expect} from '@playwright/test';

test('headless learning trains, saves, evaluates and reopens a real brain',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#agentHub')).toBeVisible();
 await page.locator('#hubTools').click();
 await expect(page.locator('#makeScenario')).toBeVisible();
 await page.locator('#episodeCount').selectOption('100');
 await page.locator('#trainBtn').click();
 await expect(page.locator('#trainState')).toContainText('Обучение');
 await expect(page.locator('#trainState')).toContainText('Готово',{timeout:50000});
 await expect(page.locator('#metricEpisodes')).toContainText('100');
 await expect(page.locator('#bestReplay')).toBeEnabled();
 await expect(page.locator('#modelSelect option')).not.toHaveCount(1,{timeout:12000});
 await page.locator('#evaluateBtn').click();
 await expect(page.locator('#evalResults')).toContainText('Новые карты',{timeout:30000});
 await page.locator('#bestReplay').click();
 await expect(page.locator('#replayInfo')).toContainText('кадров');
 const before=await page.evaluate(()=>window.render_game_to_text());
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#hubTools').click();
 await expect(page.locator('#modelSelect option')).not.toHaveCount(1,{timeout:12000});
 await page.locator('#modelSelect').selectOption('autosave');
 await page.locator('#loadBrain').click();
 await expect(page.locator('#stateCount')).not.toContainText('0 состояний');
 const after=await page.evaluate(()=>window.render_game_to_text());
 expect(JSON.parse(before).grid).toEqual(JSON.parse(after).grid);
 expect(errors).toEqual([]);
});
test('environment edits are transactional and survive reload',async({page})=>{
 await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
 await page.locator('#hubTools').click();
 const initial=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
 await page.locator('#scenarioSelect').selectOption('hazards');
 await page.locator('#makeScenario').click();
 const hazard=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
 expect(hazard.grid).not.toEqual(initial.grid);
 await page.locator('#undo').click();
 expect(JSON.parse(await page.evaluate(()=>window.render_game_to_text())).grid).toEqual(hazard.grid); // freshly generated scenarios clear stale history
 await page.locator('#save').click();
 await page.reload({waitUntil:'domcontentloaded'});
 expect(JSON.parse(await page.evaluate(()=>window.render_game_to_text())).grid).toEqual(hazard.grid);
});
for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1280,height:800}]){
 test('experiment controls remain accessible at '+viewport.width+'×'+viewport.height,async({browser})=>{
  const context=await browser.newContext({viewport,isMobile:viewport.width<900,hasTouch:viewport.width<900,deviceScaleFactor:1,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
   await expect(page.locator('#cv')).toBeVisible();
   await expect(page.locator('#hubTrain')).toBeVisible();
   await page.locator('#hubTrain').scrollIntoViewIfNeeded();
   const width=await page.evaluate(()=>document.documentElement.scrollWidth);
   expect(width).toBeLessThanOrEqual(viewport.width+3);
   expect(errors).toEqual([]);
  }finally{await context.close();}
 });
}
