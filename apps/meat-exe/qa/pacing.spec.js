import {test,expect} from '@playwright/test';
const KEY='pocket-works:meat-exe:session';
test('new long-form organ moves from a fully cleared pulse to next active encounter and persists',async({page})=>{
 test.setTimeout(80000);
 await page.goto('/apps/meat-exe/');
 await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({
  v:5,seed:413,x:3,z:3,wave:2,hp:87,maxHp:100,
  toSpawn:0,spawnClock:0,enemies:[],pickups:[],ruptured:[],
  guardianPending:0,guardianDefeated:[],
  pulseMax:3,pulse:1,pulseSpawned:7,organRuptureClaimed:false,
  immune:{heat:4,cooldown:30,warning:0,pending:'',responses:0,guardianStages:[],quiet:0}
 })),KEY);
 await page.reload();await page.locator('#resumeSaved').click();
 await expect.poll(()=>page.evaluate(()=>window.__MEAT_QA__().pacing.pulse),{timeout:16000}).toBe(2);
 const a=await page.evaluate(()=>window.__MEAT_QA__());
 expect(a.pacing.max).toBe(3);
 expect(a.pacing.remaining+a.pacing.spawned).toBeGreaterThan(0);
 await expect(page.locator('#pulseValue')).toHaveText('ПУЛЬС 2/3');
 await test.info().attach('organ-pulse-2',{body:await page.screenshot(),contentType:'image/png'});
 await page.keyboard.press('Escape');await expect(page.locator('#pauseMenu')).toBeVisible();
 await page.locator('#menuPause').click();await page.reload();await page.locator('#resumeSaved').click();
 const b=await page.evaluate(()=>window.__MEAT_QA__());
 expect(b.pacing.pulse).toBe(2);
 expect(b.pacing.max).toBe(3);
});
