import {test,expect} from '@playwright/test';
const SESSION='pocket-works:meat-exe:session';
const ARCHIVE='pocket-works:meat-exe:archive';
test('real surgery chooses risk/reward route and persists through pause and reload',async ({page})=>{
 test.setTimeout(95000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/meat-exe/');
 await page.evaluate((session)=>localStorage.setItem(session,JSON.stringify({
  v:5,seed:413,x:3,z:3,wave:1,hp:45,maxHp:100,toSpawn:0,
  enemies:[],pickups:[],biomass:0,grafts:[],ruptured:[],routeHistory:[]
 })),SESSION);
 await page.reload();await page.locator('#resumeSaved').click();
 await expect(page.locator('#graftDraft')).toBeVisible({timeout:28000});
 await expect(page.locator('.graft-option')).toHaveCount(3);
 await expect(page.locator('.route-option')).toHaveCount(2);
 const option=page.locator('.route-option').nth(1),chosen=await option.getAttribute('data-route');
 await option.click();
 await expect(option).toHaveAttribute('aria-pressed','true');
 await page.locator('.graft-option').first().click();
 await expect(page.locator('#hud')).toBeVisible();
 const live=await page.evaluate(()=>window.__MEAT_QA__());
 expect(live.routes.active).toBe(chosen);
 expect(live.routes.history).toEqual([{wave:2,id:chosen}]);
 expect(live.worldStage).toBe(2);
 expect(live.builds.biomass).toBeGreaterThanOrEqual(2);
 await page.keyboard.press('Escape');
 await expect(page.locator('#pauseMenu')).toBeVisible();
 await page.locator('#menuPause').click();await page.reload();await page.locator('#resumeSaved').click();
 const loaded=await page.evaluate(()=>window.__MEAT_QA__());
 expect(loaded.routes.active).toBe(chosen);
 expect(loaded.routes.history).toEqual(live.routes.history);
 expect(errors).toEqual([]);
});
test('archive unlocks and equips a real beginning-of-run adaptation',async ({page})=>{
 test.setTimeout(95000);
 await page.goto('/apps/meat-exe/');
 await page.evaluate((key)=>localStorage.setItem(key,JSON.stringify({echoes:9,unlocked:[],equipped:null,runs:1})),ARCHIVE);
 await page.reload();
 await page.locator('#archiveToggle').click();
 await expect(page.locator('#archivePanel')).toBeVisible();
 await page.locator('.archive-option').filter({hasText:'КАЛЬЦИНОЗ'}).click();
 const arc=await page.evaluate(()=>window.__MEAT_QA__().archive);
 expect(arc.equipped).toBe('ossified');expect(arc.echoes).toBe(6);
 await page.locator('#startBtn').click();
 await expect(page.locator('#hud')).toBeVisible();
 const qa=await page.evaluate(()=>window.__MEAT_QA__());
 expect(qa.hp).toBe(114);
 await page.keyboard.press('Escape');await expect(page.locator('#pauseMenu')).toBeVisible();
 await page.locator('#menuPause').click();await page.reload();
 const saved=await page.evaluate(()=>window.__MEAT_QA__().archive);
 expect(saved.equipped).toBe('ossified');expect(saved.echoes).toBe(6);
});
