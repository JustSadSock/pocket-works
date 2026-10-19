import {test,expect} from '@playwright/test';

test('all four organ environments restore and have distinct zone labels',async ({page})=>{
 test.setTimeout(105000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [wave,name,id] of [[1,'СОСУДЫ','vascular'],[2,'ЖЕЛУДОК','gastric'],[3,'КОСТНЫЙ МОЗГ','marrow'],[4,'НЕРВЫ','neural']]){
  await page.goto('/apps/meat-exe/');
  await page.evaluate(s=>localStorage.setItem('pocket-works:meat-exe:session',JSON.stringify(s)),{
   v:4,seed:413,x:3,z:3,wave,hp:90,maxHp:100,toSpawn:1,spawnClock:30,
   ruptured:[],ruptureCount:0,enemies:[],pickups:[],immuneDelay:0});
  await page.reload();
  await expect(page.locator('#resumeSaved')).toBeVisible();
  await page.locator('#resumeSaved').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#zoneValue')).toHaveText(name);
  const state=await page.evaluate(()=>window.__MEAT_QA__());
  expect(state.worldStage).toBe(wave);expect(state.biome).toBe(id);
  expect(state.mode).toBe('playing');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pauseMenu')).toBeVisible();
  await page.locator('#menuPause').click();
 }
 expect(errors).toEqual([]);
});

test('finishing a wave travels into an actual new anatomical world',async ({page})=>{
 test.setTimeout(65000);
 await page.goto('/apps/meat-exe/');
 await page.evaluate(()=>localStorage.setItem('pocket-works:meat-exe:session',JSON.stringify({
  v:4,seed:1337,x:3,z:3,hp:100,maxHp:100,wave:1,toSpawn:0,score:0,
  enemies:[],pickups:[],ruptured:[],ruptureCount:0,immuneHeat:0,immuneDelay:0
 })));
 await page.reload();await page.locator('#resumeSaved').click();
 // v1.6 intentionally pauses between organs for a real surgery decision.
 await expect.poll(()=>page.evaluate(()=>window.__MEAT_QA__()?.builds.pendingDraft),{timeout:20000}).toBe(2);
 await expect(page.locator('#graftDraft')).toBeVisible();
 await expect(page.locator('.graft-option')).toHaveCount(3);
 await page.locator('.graft-option').first().click();
 await expect.poll(()=>page.evaluate(()=>window.__MEAT_QA__()?.worldStage),{timeout:20000}).toBe(2);
 await expect(page.locator('#zoneValue')).toHaveText('ЖЕЛУДОК');
 const s=await page.evaluate(()=>window.__MEAT_QA__());
 expect(s.wave).toBe(2);expect(s.biome).toBe('gastric');
 await page.keyboard.press('Escape');await expect(page.locator('#pauseMenu')).toBeVisible();
 await page.locator('#menuPause').click();
 await page.reload();await page.locator('#resumeSaved').click();
 const saved=await page.evaluate(()=>window.__MEAT_QA__());
 expect(saved.worldStage).toBe(2);
});
