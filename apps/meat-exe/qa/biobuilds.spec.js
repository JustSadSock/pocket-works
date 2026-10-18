import {test,expect} from '@playwright/test';
const key='pocket-works:meat-exe:session';
const mk=(other={})=>({v:5,seed:413,x:3,z:3,wave:1,hp:100,maxHp:100,toSpawn:0,
 enemies:[],pickups:[],grafts:[],biomass:3,pendingDraft:0,ruptured:[],...other});
test('real wave finish opens surgery; reroll, choose and save are durable',async ({page})=>{
 test.setTimeout(105000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/meat-exe/');
 await page.evaluate(({key,run})=>localStorage.setItem(key,JSON.stringify(run)),{key,run:mk()});
 await page.reload();await page.locator('#resumeSaved').click();
 await expect(page.locator('#graftDraft')).toBeVisible({timeout:23000});
 await expect(page.locator('.graft-option')).toHaveCount(3);
 const first=await page.evaluate(()=>window.__MEAT_QA__().builds);
 expect(first.pendingDraft).toBe(2);expect(first.choices).toHaveLength(3);
 await expect(page.locator('#draftReroll')).toBeEnabled();
 await page.locator('#draftReroll').click();
 await expect.poll(()=>page.evaluate(()=>window.__MEAT_QA__().builds.biomass)).toBe(1);
 await expect(page.locator('#draftReroll')).toBeDisabled();
 const chosen=await page.locator('.graft-option').first().getAttribute('data-graft');
 await page.locator('.graft-option').first().click();
 await expect(page.locator('#hud')).toBeVisible();
 const after=await page.evaluate(()=>window.__MEAT_QA__());
 expect(after.worldStage).toBe(2);expect(after.builds.pendingDraft).toBe(0);
 expect(after.builds.grafts).toContain(chosen);expect(after.builds.biomass).toBe(1);
 await page.locator('#pauseBtn').click();await page.locator('#menuPause').click();
 await page.reload();await page.locator('#resumeSaved').click();
 const saved=await page.evaluate(()=>window.__MEAT_QA__());
 expect(saved.builds.grafts).toContain(chosen);
 expect(saved.worldStage).toBe(2);expect(errors).toEqual([]);
});
test('pending surgery persists across reload; the actual weapon control selects the needle launcher',async ({page,isMobile})=>{
 test.setTimeout(85000);await page.goto('/apps/meat-exe/');
 const seed=await page.evaluate(async()=>{
  const {drawGrafts}=await import('/apps/meat-exe/biobuilds.js');
  for(let n=1996;n<8000;n++)if(drawGrafts(n,2,[]).some(g=>g.id==='stinger'))return n;
  return null;
 });
 expect(seed).not.toBeNull();
 await page.evaluate(({key,run})=>localStorage.setItem(key,JSON.stringify(run)),{
  key,run:mk({seed,pendingDraft:2,biomass:0,toSpawn:1,spawnClock:30})
 });
 await page.reload();await page.locator('#resumeSaved').click();
 await expect(page.locator('#graftDraft')).toBeVisible();
 await page.reload();await page.locator('#resumeSaved').click();
 await expect(page.locator('#graftDraft')).toBeVisible();
 await page.locator('[data-graft="stinger"]').click();
 await expect(page.locator('#hud')).toBeVisible();
 expect((await page.evaluate(()=>window.__MEAT_QA__())).builds.weaponCount).toBe(3);
 if(isMobile){await page.locator('#weaponBtn').tap();await page.locator('#weaponBtn').tap();}
 else{await page.keyboard.press('q');await page.keyboard.press('q');}
 await expect(page.locator('#weaponValue')).toContainText('ИГЛОМЁТ');
 expect((await page.evaluate(()=>window.__MEAT_QA__())).builds.damage).toBeGreaterThan(50);
});
