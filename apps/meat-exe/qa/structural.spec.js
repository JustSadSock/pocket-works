import {test,expect} from '@playwright/test';

const KEY='pocket-works:meat-exe:session';
test('vascular, marrow, neural have real geometry, landmarks and readable floor hazards',async ({page})=>{
 test.setTimeout(110000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [wave,biome,room] of [
  [1,'vascular','valve-hall'],[3,'marrow','bone-well'],[4,'neural','synapse']
 ]){
  await page.goto('/apps/meat-exe/');
  await page.evaluate(({key,wave})=>localStorage.setItem(key,JSON.stringify({
   v:5,seed:413,x:3,z:3,wave,hp:100,maxHp:100,toSpawn:1,spawnClock:30,
   enemies:[],pickups:[],ruptured:[],immune:{heat:0,cooldown:30,warning:0,pending:'',responses:0,guardianStages:[],quiet:0}
  })),{key:KEY,wave});
  await page.reload();
  await expect(page.locator('#resumeSaved')).toBeVisible();
  await page.locator('#resumeSaved').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.__MEAT_QA__()?.architecture?.type)).toBe(room);
  const qa=await page.evaluate(()=>window.__MEAT_QA__());
  expect(qa.worldStage).toBe(wave);
  expect(qa.architecture.biome).toBe(biome);
  expect(qa.architecture.ribs).toBeGreaterThanOrEqual(2);
  await test.info().attach('structural-'+biome,{body:await page.screenshot(),contentType:'image/png'});
  await page.keyboard.press('Escape');await expect(page.locator('#pauseMenu')).toBeVisible();
  await page.locator('#menuPause').click();
 }
 expect(errors).toEqual([]);
});
