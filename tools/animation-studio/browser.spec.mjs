import {test,expect} from '@playwright/test';
test('authored motion, contact audio, interruption, pause and offline replay',async({page,context},info)=>{
 const errors=[],failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>failed.push(r.url()));page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
 await page.goto('./');await page.waitForFunction(()=>window.__MOTION_TEST_STATE__?.offlineReady);
 const state=()=>page.evaluate(()=>window.__MOTION_TEST_STATE__);
 expect((await state()).rigs).toBeGreaterThan(0);
 await page.locator('#speed').selectOption('.5');
 for(const medium of ['drawn','skeletal','physical','baked']){
  await page.locator(`[data-medium=${medium}]`).click();const before=(await state()).contacts;
  await page.screenshot({path:info.outputPath(`${medium}-first.png`)});await page.locator('#strike').click();
  await page.waitForFunction(()=>window.__MOTION_TEST_STATE__.time>=.2);await page.locator('#pause').click();
  await page.screenshot({path:info.outputPath(`${medium}-anticipation.png`)});
  const at=(await state()).time;await page.waitForTimeout(200);expect((await state()).time).toBe(at);await page.locator('#pause').click();
  await page.waitForFunction(()=>window.__MOTION_TEST_STATE__.time>=.51);await page.locator('#pause').click();await page.screenshot({path:info.outputPath(`${medium}-contact.png`)});await page.locator('#pause').click();
  await expect.poll(async()=>(await state()).completed).toBe(true);await page.screenshot({path:info.outputPath(`${medium}-settled.png`)});
  expect((await state()).contacts).toBe(before+1);
 }
 // Cancelling/replacing during anticipation must not deliver the abandoned hit.
 await page.locator('#speed').selectOption('1');const before=(await state()).contacts;
 await page.locator('#strike').click();await page.waitForTimeout(70);await page.locator('#cancel').click();await page.waitForTimeout(650);expect((await state()).contacts).toBe(before);
 await page.locator('#strike').click();await page.waitForTimeout(70);await page.locator('#strike').click();await expect.poll(async()=>(await state()).completed).toBe(true);expect((await state()).contacts).toBe(before+1);
 const s=await state();expect(s.audioState).toBe('running');expect(s.audio.length).toBeGreaterThanOrEqual(5);expect(s.audio.every(a=>a.eventTime===.5)).toBe(true);
 // A sound is dispatched alongside each contact, not prequeued for future hits.
 for(const sound of s.audio){const event=s.events.find(e=>e.generation===sound.generation&&e.name==='contact');expect(event).toBeTruthy();expect(Math.abs(sound.wall-event.wall)).toBeLessThan(50);}
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-medium=physical]').click();await page.locator('#strike').click();await expect.poll(async()=>(await state()).completed).toBe(true);expect((await state()).particles).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await context.setOffline(true);await page.reload();await page.waitForFunction(()=>window.__MOTION_TEST_STATE__?.offlineReady);await page.locator('[data-medium=skeletal]').click();await page.locator('#strike').click();await expect.poll(async()=>(await state()).completed).toBe(true);await page.screenshot({path:info.outputPath('offline.png')});
 expect(errors).toEqual([]);expect(failed).toEqual([]);
 await info.attach('motion-evidence',{body:JSON.stringify({testedSha:process.env.TESTED_SHA||'local',project:info.project.name,viewport:page.viewportSize(),state:await state(),online:s}),contentType:'application/json'});
});
