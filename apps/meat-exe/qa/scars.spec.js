import {test,expect} from '@playwright/test';
const KEY='pocket-works:meat-exe:session';

test('persistent scars are physically rendered in the right organ after reloading',async({page})=>{
 test.setTimeout(95000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/meat-exe/');
 await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({
  v:5,seed:413,x:3,z:3,wave:3,hp:100,maxHp:100,toSpawn:1,spawnClock:30,
  enemies:[],pickups:[],ruptured:[],guardianPending:0,
  scars:[{wave:1,x:3,z:4,kind:'burn'}, {wave:3,x:4,z:4,kind:'blood'},
         {wave:3,x:3,z:5,kind:'rupture'}],
  immune:{heat:0,cooldown:30,warning:0,pending:'',responses:0,guardianStages:[],quiet:0}
 })),KEY);
 await page.reload();
 await page.locator('#resumeSaved').click();
 await expect(page.locator('#hud')).toBeVisible();
 const qa=await page.evaluate(()=>window.__MEAT_QA__());
 expect(qa.tissueMemory).toEqual({wave:3,count:2,blood:1,rupture:1,burn:0});
 expect(qa.combat.scars).toBe(2);
 await test.info().attach('retained-marrow-scars',{body:await page.screenshot(),contentType:'image/png'});
 await page.keyboard.press('Escape');
 await page.locator('#menuPause').click();
 await page.reload();
 await page.locator('#resumeSaved').click();
 const again=await page.evaluate(()=>window.__MEAT_QA__());
 expect(again.combat.scars).toBe(2);
 expect(errors).toEqual([]);
});
test('organ transition mask exists, is noninteractive, and honors reduced-motion',async({page})=>{
 await page.goto('/apps/meat-exe/');
 const mask=page.locator('#organIris');
 await expect(mask).toHaveAttribute('aria-hidden','true');
 expect(await mask.evaluate(el=>getComputedStyle(el).pointerEvents)).toBe('none');
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(page.locator('#startBtn')).toBeVisible();
 await page.locator('#startBtn').click();
 await expect(page.locator('#hud')).toBeVisible();
 await expect(mask).not.toHaveClass(/organ-transition-active/);
});
