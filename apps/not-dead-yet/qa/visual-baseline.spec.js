import {test,expect} from '@playwright/test';

// Run with the app's regular Playwright harness, not in normal user mode.
// Captures artifacts for real browser review; does not claim phone GPU validation.
const origin='/apps/not-dead-yet/?qa=1';
test('three reproducible visual references render without WebGL errors',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__PW_ROGUE_QA__?.visual&&window.__PW_TEST_STATE__?.renderer3D,{timeout:20000});
 for(const seed of [222,413,8787,4,14]){
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


test('returning along a corridor reuses cached architectural geometry without rebuilding',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__PW_ROGUE_QA__?.visual&&window.__PW_TEST_STATE__?.renderer3D,{timeout:20000});
 await page.evaluate(()=>window.__PW_ROGUE_QA__.startSeed(222));
 await page.waitForFunction(()=>window.__PW_TEST_STATE__?.phase==='play');
 const first=await page.evaluate(()=>{
  const api=window.__PW_ROGUE_QA__,w=api.world();
  api.setPosition(9.5,9.5);
  const original=api.player();
  const gridX=Math.floor(original.x/5),gridZ=Math.floor(original.z/5);
  for(let z=-8;z<=24;z++)for(let x=-8;x<=24;x++){
   if(Math.floor(x/5)===gridX&&Math.floor(z/5)===gridZ)continue;
   if(w.canStand(x+.5,z+.5))return{x:x+.5,z:z+.5}
  }
  return null
 });
 expect(first).not.toBeNull();
 const before=await page.evaluate(()=>window.__PW_ROGUE_QA__.visual().renderer.cacheHits||0);
 await page.evaluate(position=>window.__PW_ROGUE_QA__.setPosition(position.x,position.z),first);
 await page.waitForFunction(p=>window.__PW_ROGUE_QA__.visual().renderer.lastMeshKey?.endsWith(
  ':'+Math.floor(p.x/5)+':'+Math.floor(p.z/5)),first,{timeout:4000});
 await page.evaluate(()=>window.__PW_ROGUE_QA__.setPosition(9.5,9.5));
 await page.waitForFunction(old=>window.__PW_ROGUE_QA__.visual().renderer.cacheHits>old,before,{timeout:4000});
 const stats=await page.evaluate(()=>window.__PW_ROGUE_QA__.visual().renderer);
 expect(stats.cacheEntries).toBeGreaterThanOrEqual(2);
 expect(stats.cacheEntries).toBeLessThanOrEqual(3);
 expect(stats.meshBuildMs).toBe(0);
 expect(stats.cacheBytes).toBeGreaterThan(0);
 expect(errors).toEqual([])
});


test('first seconds: no keyboard instruction banner covering mobile horror view',async({page})=>{
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__PW_ROGUE_QA__?.world&&window.__PW_TEST_STATE__?.renderer3D,{timeout:20000});
 const mobile=await page.evaluate(()=>matchMedia('(pointer:coarse)').matches);
 await page.locator('#start').click();
 await page.waitForFunction(()=>window.__PW_TEST_STATE__?.phase==='play');
 if(mobile){
  expect(await page.locator('#hint').evaluate(el=>el.classList.contains('visible'))).toBe(false);
 }else{
  const overlaps=await page.evaluate(()=>{
   const tip=document.getElementById('hint').getBoundingClientRect(),aim=document.querySelector('.reticle').getBoundingClientRect();
   return tip.left<aim.right&&tip.right>aim.left&&tip.top<aim.bottom&&tip.bottom>aim.top
  });
  expect(overlaps).toBe(false)
 }
 await page.screenshot({path:test.info().outputPath('horror-first-seconds.png'),animations:'disabled'})
});
