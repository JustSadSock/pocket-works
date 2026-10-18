import {test,expect} from '@playwright/test';

// Run with the app's regular Playwright harness, not in normal user mode.
// Captures artifacts for real browser review; does not claim phone GPU validation.
const origin='/apps/not-dead-yet/?qa=1';
test('three reproducible visual references render without WebGL errors',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__PW_ROGUE_QA__?.visual&&window.__PW_TEST_STATE__?.renderer3D,{timeout:20000});
 for(const seed of [222,413,8787]){
  const ok=await page.evaluate(seed=>window.__PW_ROGUE_QA__.startSeed(seed),seed);
  expect(ok).toBe(true);
  for(const scene of ['corridor','living','kitchen','bathroom']){
   const bookmark=await page.evaluate(name=>window.__PW_ROGUE_QA__.bookmark(name),scene);
   expect(bookmark).not.toBeNull();
   await page.waitForFunction(p=>window.__PW_TEST_STATE__?.position?.x===p.x&&window.__PW_TEST_STATE__?.position?.z===p.z,bookmark);
   await page.screenshot({path:test.info().outputPath(`seed-${seed}-${scene}.png`),animations:'disabled'});
   const metrics=await page.evaluate(()=>window.__PW_ROGUE_QA__.visual().renderer);
   expect(metrics.staticTriangles).toBeGreaterThan(14000);
   expect(metrics.staticTriangles).toBeLessThan(35000);
   expect(metrics.staticBytes).toBeGreaterThan(0);
  }
 }
 expect(errors).toEqual([])
});
