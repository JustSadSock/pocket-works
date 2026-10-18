import {test,expect} from '@playwright/test';

const path='/apps/not-dead-yet/?qa=1';
async function boot(page){
 await page.goto(path,{waitUntil:'domcontentloaded'});
 await expect(page.locator('#start')).toBeVisible({timeout:20000});
 await page.waitForFunction(()=>window.__PW_ROGUE_QA__&&window.__PW_TEST_STATE__?.renderer3D,{timeout:20000});
 await page.locator('#start').click();
 await page.waitForFunction(()=>window.__PW_TEST_STATE__?.phase==='play',{timeout:20000});
}
const state=page=>page.evaluate(()=>structuredClone(window.__PW_TEST_STATE__));

test('default entry is a genuinely endless first-person game with survival, input and save',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await boot(page);
 const a=await state(page);
 expect(a.endless).toBe(true);expect(a.sovietInterior).toBe(true);
 await page.keyboard.down('w');await page.waitForTimeout(650);await page.keyboard.up('w');
 const b=await state(page);
 expect(Math.hypot(b.position.x-a.position.x,b.position.z-a.position.z)).toBeGreaterThan(.5);
 await page.keyboard.press('Space');
 await expect.poll(async()=>(await state(page)).ammo).toBe(5);
 await page.keyboard.press('r');
 await expect.poll(async()=>(await state(page)).ammo,{timeout:3500}).toBe(6);
 await page.locator('#pause').click();await expect(page.locator('#pauseOverlay')).toBeVisible();
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('#continue')).toBeVisible();
 await page.locator('#continue').click();
 await page.waitForFunction(()=>window.__PW_TEST_STATE__?.phase==='play');
 expect((await state(page)).seed).toBe(a.seed);
 expect(errors).toEqual([])
});

test('finding a recognizable thing offers three functional upgrades and saves the selection',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await boot(page);
 const found=await page.evaluate(()=>{
  const api=window.__PW_ROGUE_QA__,w=api.world();
  for(let cz=-1;cz<=1;cz++)for(let cx=-1;cx<=1;cx++){
   const drop=w.chunk(cx,cz).drops.find(x=>x.type==='relic');
   if(drop&&api.setPosition(drop.x,drop.z))return drop.id
  }return null
 });
 expect(found).not.toBeNull();
 await page.keyboard.press('e');
 await expect(page.locator('#upgradeOverlay')).toBeVisible();
 await expect(page.locator('.upgrade-card')).toHaveCount(3);
 await page.locator('.upgrade-card').first().click();
 await page.waitForFunction(()=>window.__PW_TEST_STATE__?.phase==='play');
 const acquired=await state(page);
 expect(Object.values(acquired.upgrades).reduce((a,b)=>a+b,0)).toBe(1);
 await page.locator('#pack').click();
 await expect(page.locator('#inventoryOverlay')).toBeVisible();
 await expect(page.locator('.inventory-row.found')).toHaveCount(1);
 await page.locator('#closePack').click();
 await page.locator('#pause').click();await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#continue').click();
 await page.waitForFunction(()=>window.__PW_TEST_STATE__?.phase==='play');
 expect((await state(page)).upgrades).toEqual(acquired.upgrades);
 expect(errors).toEqual([])
});

test('forgotten rooms regenerate behind a player without blocking existing terrain',async({page})=>{
 await boot(page);
 const outcome=await page.evaluate(()=>{
  const a=window.__PW_ROGUE_QA__,w=a.world(),c=w.chunk(0,0),original=c.epoch;
  w.tick(9.5,9.5,0,0);w.tick(10.5,9.5,Math.PI/2,1);
  w.tick(20.5,9.5,Math.PI/2,4);const result=w.tick(29.5,9.5,Math.PI/2,14);
  return {original,now:w.chunk(0,0).epoch,changes:w.changes,connected:w.findStep(29.5,9.5,9.5,9.5)!==null,result}
 });
 expect(outcome.now).toBeGreaterThan(outcome.original);
 expect(outcome.changes).toBeGreaterThan(0);
 expect(outcome.connected).toBe(true)
});
