import {test,expect} from '@playwright/test';
const KEY='pocket-works:meat-exe:session';
test('real wall 3D geometry restores independently from ground scars',async({page})=>{
 test.setTimeout(90000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/meat-exe/');
 await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({
  v:5,seed:413,x:3,z:3,wave:3,hp:100,maxHp:100,toSpawn:1,spawnClock:30,
  enemies:[],pickups:[],ruptured:[],guardianPending:0,
  scars:[{wave:3,x:3.5,z:4,kind:'burn',surface:'wall',y:1.25,nx:1,nz:0},
         {wave:3,x:3,z:4,kind:'blood'}, {wave:1,x:4,z:4,kind:'burn'}],
  immune:{heat:0,cooldown:30,warning:0,pending:'',responses:0,guardianStages:[],quiet:0}
 })),KEY);
 await page.reload();await page.locator('#resumeSaved').click();
 await expect(page.locator('#hud')).toBeVisible();
 const first=await page.evaluate(()=>window.__MEAT_QA__());
 expect(first.woundSurfaces).toEqual({wall:1,floor:1});
 expect(first.combat.wallWounds).toBe(1);
 expect(first.combat.scars).toBe(2);
 await test.info().attach('wall-tear',{body:await page.screenshot(),contentType:'image/png'});
 await page.keyboard.press('Escape');await page.locator('#menuPause').click();
 await page.reload();await page.locator('#resumeSaved').click();
 const again=await page.evaluate(()=>window.__MEAT_QA__());
 expect(again.combat.wallWounds).toBe(1);
 expect(again.combat.scars).toBe(2);
 expect(errors).toEqual([]);
});
