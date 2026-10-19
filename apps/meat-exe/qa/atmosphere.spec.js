import {test,expect} from '@playwright/test';
const KEY='pocket-works:meat-exe:session';

test('v1.9 materials and living atmosphere are instantiated in the actual 3D scene',async({page,isMobile})=>{
 test.setTimeout(135000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // On mobile emulation inspect both physiological extremes without forcing
 // four costly WebGL teardown/recreates in a single parallel CI job.
 const stages=isMobile?[[1,'vascular'],[4,'neural']]:
   [[1,'vascular'],[2,'gastric'],[3,'marrow'],[4,'neural']];
 for(const [wave,biome] of stages){
  await page.goto('/apps/meat-exe/');
  await page.evaluate(({key,wave})=>localStorage.setItem(key,JSON.stringify({
    v:5,seed:413,x:3,z:3,wave,hp:100,maxHp:100,toSpawn:1,spawnClock:30,
    enemies:[],pickups:[],ruptured:[],guardianPending:0,
    immune:{heat:0,cooldown:30,warning:0,pending:'',responses:0,guardianStages:[],quiet:0}
  })),{key:KEY,wave});
  await page.reload();
  await page.locator('#resumeSaved').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.__MEAT_QA__()?.atmosphere?.stage),{timeout:24000}).toBe(wave);
  const a=await page.evaluate(()=>window.__MEAT_QA__().atmosphere);
  expect(a.biome).toBe(biome);
  expect(a.enemyTextureFamilies).toEqual(expect.arrayContaining(['vascular','gastric','marrow','neural']));
  expect(a.wetMaps===0||a.wetMaps===4).toBe(true);
  expect(a.motes).toBeLessThanOrEqual(88);
  expect(a.deathFragments).toBeLessThanOrEqual(24);
  expect(a.maxAdditionalLights).toBeLessThanOrEqual(1);
  if(a.quality==='low'||a.wetMaps===0)expect(a.motes).toBe(0);
  await test.info().attach('atmosphere-'+biome,{body:await page.screenshot(),contentType:'image/png'});
  await page.keyboard.press('Escape');await expect(page.locator('#pauseMenu')).toBeVisible();
  await page.locator('#menuPause').click();
 }
 expect(errors).toEqual([]);
});
