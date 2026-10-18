import {test,expect} from '@playwright/test';

async function launch(page){
 await page.goto('/apps/not-dead-yet/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#start')).toBeVisible({timeout:15000});
 await page.waitForFunction(()=>window.__PW_TEST_STATE__?.renderer3D===true,{timeout:15000});
 await page.locator('#start').click();
 await page.waitForFunction(()=>window.__PW_TEST_STATE__?.phase==='play',{timeout:15000});
}
const state=page=>page.evaluate(()=>structuredClone(window.__PW_TEST_STATE__));
const dist=(a,b)=>Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z);

test('desktop end-to-end input: move, look, shoot, reload, inventory, save and distinct new seed',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await launch(page);
 const original=await state(page);
 await page.keyboard.down('w');await page.waitForTimeout(520);await page.keyboard.up('w');
 const moved=await state(page);
 expect(dist(original,moved)).toBeGreaterThan(.35);
 expect(moved.moves).toBeGreaterThan(0);
 await page.keyboard.press('i');
 await expect(page.locator('#inventoryOverlay')).toBeVisible();
 await expect(page.locator('.inventory-row')).toHaveCount(4);
 await page.locator('#closePack').click();
 await page.keyboard.press('Space');
 await expect.poll(async()=> (await state(page)).ammo).toBe(5);
 await page.keyboard.press('r');await page.waitForTimeout(1750);
 expect((await state(page)).ammo).toBe(6);
 await page.locator('#pause').click();await expect(page.locator('#pauseOverlay')).toBeVisible();
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('#continue')).toBeVisible();
 await page.locator('#continue').click();await page.waitForFunction(()=>window.__PW_TEST_STATE__?.phase==='play');
 const resumed=await state(page);
 expect(resumed.seed).toBe(original.seed);
 expect(Math.hypot(resumed.position.x-moved.position.x,resumed.position.z-moved.position.z)).toBeLessThan(.35);
 await page.locator('#pause').click();await page.locator('#new').click();
 await expect(page.locator('#confirmOverlay')).toBeVisible();await page.locator('#erase').click();
 await page.waitForFunction(old=>window.__PW_TEST_STATE__?.seed!==old,original.seed);
 expect((await state(page)).seed).not.toBe(original.seed);
 expect(errors).toEqual([]);
});

test('mobile twin-stick traversal, turn, shoot and item drawer',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await launch(page);
  const before=await state(page);
  const joy=await page.locator('#joystick').boundingBox();expect(joy).not.toBeNull();
  const x=joy.x+joy.width*.5,y=joy.y+joy.height*.5;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y-joy.height*.35,{steps:8});
  await page.waitForTimeout(460);await page.mouse.up();
  const after=await state(page);expect(dist(before,after)).toBeGreaterThan(.20);
  const look=await page.locator('#touchLook').boundingBox();
  await page.mouse.move(look.x+look.width*.52,look.y+look.height*.5);await page.mouse.down();
  await page.mouse.move(look.x+look.width*.70,look.y+look.height*.58,{steps:8});await page.mouse.up();
  const turned=await state(page);expect(Math.abs(turned.position.yaw-after.position.yaw)).toBeGreaterThan(.08);
  await page.locator('#fire').click();expect((await state(page)).ammo).toBe(5);
  await page.locator('#pack').click();await expect(page.locator('#inventoryOverlay')).toBeVisible();
  await page.locator('#closePack').click();await expect(page.locator('#view')).toBeVisible();
  expect(errors).toEqual([]);
 }finally{await context.close()}
});

test('1.2 material atlas and pause-menu sound controls survive a page refresh',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await launch(page);
 await expect.poll(async()=> (await state(page)).textureBytes).toBe(384*384*4);
 await page.locator('#pause').click();
 await expect(page.locator('#pauseSound')).toBeVisible();
 const before=(await state(page)).soundEnabled;
 await page.locator('#pauseSound').click();
 await expect.poll(async()=>(await state(page)).soundEnabled).toBe(!before);
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('#start')).toBeVisible();
 await expect(page.locator('#sound')).toContainText(!before?'вкл':'выкл');
 expect(errors).toEqual([]);
});


test('1.3 hinged Soviet interior door opens, blocks passage, saves and restores',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/not-dead-yet/?qa=1',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#start')).toBeVisible();
 await page.waitForFunction(()=>window.__PW_TEST_STATE__?.renderer3D===true);
 await page.locator('#start').click();
 await page.waitForFunction(()=>window.__PW_TEST_STATE__?.phase==='play');
 const room=(await state(page)).doors[0].room;
 expect(await page.evaluate(room=>window.__PW_TEST_HOOKS__.teleportNearDoor(room),room)).toBe(true);
 await expect(page.locator('#interact')).toHaveText('Закрыть');
 if(await page.locator('#interact').isVisible())await page.locator('#interact').click();else await page.keyboard.press('e');
 await expect.poll(async()=> (await state(page)).doors.find(d=>d.room===room).open).toBe(false);
 await expect.poll(async()=> (await state(page)).doors.find(d=>d.room===room).angle).toBeLessThan(.04);
 await page.locator('#pause').click();
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('#continue')).toBeVisible();
 await page.locator('#continue').click();
 await page.waitForFunction(()=>window.__PW_TEST_STATE__?.phase==='play');
 expect((await state(page)).doors.find(d=>d.room===room).open).toBe(false);
 await expect(page.locator('#interact')).toHaveText('Открыть');
 if(await page.locator('#interact').isVisible())await page.locator('#interact').click();else await page.keyboard.press('e');
 await expect.poll(async()=> (await state(page)).doors.find(d=>d.room===room).open).toBe(true);
 await expect.poll(async()=> (await state(page)).doors.find(d=>d.room===room).angle).toBeGreaterThan(1.4);
 expect(errors).toEqual([]);
});


test('1.4 unfamiliar furniture can be remembered, reduces panic and survives resume',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/not-dead-yet/?qa=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__PW_TEST_STATE__?.renderer3D===true);
 await page.locator('#start').click();
 await page.waitForFunction(()=>window.__PW_TEST_STATE__?.phase==='play');
 const room=await page.evaluate(()=>{
  // A lower room is safely behind the protagonist's initial north-facing gaze.
  const r=window.__PW_TEST_STATE__.doors;
  return r.find(x=>x.gate.z===14)?.room
 });
 expect(room).toBeTruthy();
 expect(await page.evaluate(room=>window.__PW_TEST_HOOKS__.triggerUnseenShift(room),room)).toBe(true);
 await expect.poll(async()=>(await state(page)).memoryTraces.find(x=>x.type===room).active).toBe(true);
 expect(await page.evaluate(room=>window.__PW_TEST_HOOKS__.teleportNearMemory(room),room)).toBe(true);
 // The familiar family object is collected first, then the false memory is confronted.
 await page.keyboard.press('e');
 await expect.poll(async()=> (await state(page)).inventory.length).toBe(1);
 await expect(page.locator('#aimHint')).toContainText('ВСПОМНИТЬ');
 await page.keyboard.press('e');
 await expect.poll(async()=>(await state(page)).memoryTraces.find(x=>x.type===room).active).toBe(false);
 await page.locator('#pause').click();
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#continue').click();
 await page.waitForFunction(()=>window.__PW_TEST_STATE__?.phase==='play');
 expect((await state(page)).memoryTraces.find(x=>x.type===room).active).toBe(false);
 expect((await state(page)).layoutVersion).toBe(2);
 expect(errors).toEqual([]);
});
