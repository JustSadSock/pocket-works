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
  for(let cz=-2;cz<=2;cz++)for(let cx=-2;cx<=2;cx++){
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


test('desktop layout-independent FPS controls, arrow-turn, Tab and Esc work without mouse lock',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await boot(page);
 const initial=await state(page);
 expect(await page.locator('#view').evaluate(el=>document.activeElement===el)).toBe(true);
 await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,code:'KeyW',key:'ц'})));
 await page.waitForTimeout(520);
 await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,code:'KeyW',key:'ц'})));
 const walking=await state(page);
 expect(Math.hypot(walking.position.x-initial.position.x,walking.position.z-initial.position.z)).toBeGreaterThan(.5);
 await page.waitForTimeout(120);
 const stopped=await state(page);
 expect(Math.hypot(stopped.position.x-walking.position.x,stopped.position.z-walking.position.z)).toBeLessThan(.1);
 await page.keyboard.down('ArrowRight');
 await page.waitForTimeout(470);
 await page.keyboard.up('ArrowRight');
 expect((await state(page)).position.yaw).toBeGreaterThan(.3);
 await page.keyboard.press('Space');
 await expect.poll(async()=>(await state(page)).ammo).toBe(5);
 await page.keyboard.press('Tab');
 await expect(page.locator('#inventoryOverlay')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.locator('#inventoryOverlay')).toBeHidden();
 await page.keyboard.press('Escape');
 await expect(page.locator('#pauseOverlay')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.locator('#pauseOverlay')).toBeHidden();
 expect((await state(page)).phase).toBe('play');
 expect(errors).toEqual([])
});

test('desktop mouse look surface is not hidden under the mobile touch area',async({page})=>{
 await boot(page);
 const fine=await page.evaluate(()=>matchMedia('(pointer:fine)').matches);
 if(!fine)test.skip();
 const events=await page.evaluate(()=>{
  const area=document.getElementById('touchLook');
  const p=getComputedStyle(area).pointerEvents;
  const canvas=document.getElementById('view');
  const r=canvas.getBoundingClientRect(),x=r.right-50,y=r.top+r.height*.5;
  return{p,hit:document.elementFromPoint(x,y)?.id}
 });
 expect(events.p).toBe('none');
 expect(events.hit).toBe('view')
});
