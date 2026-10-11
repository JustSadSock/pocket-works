import { test, expect } from '@playwright/test';

test('authored exports interact and reload offline in all four techniques',async({page,context},testInfo)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const missing=[];page.on('response',r=>{if(r.status()>=400)missing.push(r.url());});
 const failed=[];page.on('requestfailed',r=>failed.push(r.url()));
 await page.goto('/before/');await page.waitForFunction(()=>window.__ART_TEST_STATE__?.offlineReady);
 for(const medium of ['pixel','drawn','model','baked']){
  await page.locator(`[data-medium=${medium}]`).click();
  await page.screenshot({path:testInfo.outputPath(`${medium}-source-before.png`)});
 }
 await page.goto('/after/');await page.waitForFunction(()=>window.__ART_TEST_STATE__?.offlineReady);
 for(const medium of ['pixel','drawn','model','baked']){
  await page.locator(`[data-medium=${medium}]`).click();
  await expect.poll(()=>page.evaluate(()=>window.__ART_TEST_STATE__.medium)).toBe(medium);
  await page.screenshot({path:testInfo.outputPath(`${medium}-first.png`)});
  const actions=await page.evaluate(()=>window.__ART_TEST_STATE__.actions);
  await page.locator('#action').click();
  await expect.poll(()=>page.evaluate(()=>window.__ART_TEST_STATE__.actions)).toBe(actions+1);
  await page.screenshot({path:testInfo.outputPath(`${medium}-action.png`)});
 }
 expect(await page.evaluate(()=>window.__ART_TEST_STATE__.meshes)).toBeGreaterThan(10);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await context.setOffline(true);await page.reload();await page.waitForFunction(()=>window.__ART_TEST_STATE__?.offlineReady);
 for(const medium of ['model','baked','drawn','pixel']){await page.locator(`[data-medium=${medium}]`).click();await page.locator('#action').click();}
 await page.screenshot({path:testInfo.outputPath('offline.png')});
 expect(errors).toEqual([]);expect(missing).toEqual([]);expect(failed).toEqual([]);
 await testInfo.attach('source-to-scene-provenance',{body:JSON.stringify({testedSha:process.env.TESTED_SHA||'local-uncommitted',browser:testInfo.project.name,viewport:page.viewportSize(),state:await page.evaluate(()=>window.__ART_TEST_STATE__),scenarios:['source-before','source-after','action','offline-reload']}),contentType:'application/json'});
});
